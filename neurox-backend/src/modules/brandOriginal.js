// ═══════════════════════════════════════════════════════
// Brand Originality Module — Step 3 of scan pipeline
// CLIP embedding + pgvector similarity search
// ═══════════════════════════════════════════════════════
import { supabase } from "../services/supabase.js";

const HF_API_URL =
  "https://api-inference.huggingface.co/models/sentence-transformers/clip-ViT-B-32";
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

/**
 * Compute brand originality score by comparing the image's CLIP embedding
 * against known project embeddings stored in Supabase pgvector.
 *
 * @param {Buffer} imageBuffer - Resized image buffer
 * @param {string} scanId      - Current scan ID for labeling
 * @returns {Promise<{ brand_originality: number, flags: string[] }>}
 */
export async function checkBrandOriginality(imageBuffer, scanId) {
  let embedding;

  // ── a) Get CLIP embedding from HuggingFace ──────────
  try {
    embedding = await getClipEmbedding(imageBuffer);
  } catch (err) {
    console.warn("[BRAND_ORIGINAL] Embedding service failed:", err.message);
    return {
      brand_originality: 70,
      flags: ["embedding_service_unavailable"],
    };
  }

  // ── c) Query pgvector for nearest known project ─────
  let similarity = 0;
  let matchLabel = "";

  try {
    const embeddingStr = `[${embedding.join(",")}]`;

    const { data, error } = await supabase.rpc("match_embeddings", {
      query_embedding: embeddingStr,
      match_count: 1,
    });

    if (error) {
      console.warn("[BRAND_ORIGINAL] RPC failed, trying direct query:", error.message);
      const { data: directData, error: directError } = await supabase
        .from("embeddings")
        .select("label, embedding")
        .eq("source", "known_project")
        .limit(5);

      if (!directError && directData?.length > 0) {
        const best = findMostSimilar(embedding, directData);
        similarity = best.similarity;
        matchLabel = best.label;
      }
    } else if (data && data.length > 0) {
      similarity = data[0].similarity || 0;
      matchLabel = data[0].label || "unknown";
    }
  } catch (err) {
    console.warn("[BRAND_ORIGINAL] pgvector query failed:", err.message);
  }

  // ── d) Scoring logic ────────────────────────────────
  let brand_originality;
  const flags = [];

  if (similarity > 0.90) {
    brand_originality = 5;
    flags.push(`Logo is ${Math.round(similarity * 100)}% similar to ${matchLabel}`);
  } else if (similarity > 0.75) {
    brand_originality = 35;
    flags.push(`Possible visual overlap with ${matchLabel}`);
  } else if (similarity > 0.60) {
    brand_originality = 65;
    flags.push(`Minor stylistic similarity to ${matchLabel}`);
  } else {
    brand_originality = 90;
  }

  // ── e) Store user upload embedding ──────────────────
  try {
    const embeddingStr = `[${embedding.join(",")}]`;
    await supabase.from("embeddings").insert({
      label: scanId,
      embedding: embeddingStr,
      source: "user_upload",
    });
  } catch (err) {
    console.warn("[BRAND_ORIGINAL] Failed to store embedding:", err.message);
  }

  return { brand_originality, flags };
}

/**
 * Call HuggingFace Inference API to get a CLIP embedding for an image.
 *
 * @param {Buffer} imageBuffer
 * @returns {Promise<number[]>} 512-dimensional embedding vector
 */
async function getClipEmbedding(imageBuffer) {
  if (!HF_API_KEY) {
    throw new Error("HUGGINGFACE_API_KEY not configured");
  }

  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_API_KEY}`,
      "Content-Type": "application/octet-stream",
      "X-Wait-For-Model": "true", // Crucial: tells HF to wait for the model to wake up
    },
    body: imageBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown");
    throw new Error(`HuggingFace API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();

  let embedding;
  if (Array.isArray(result) && Array.isArray(result[0])) {
    embedding = result[0];
  } else if (Array.isArray(result)) {
    embedding = result;
  } else if (result.embeddings) {
    embedding = Array.isArray(result.embeddings[0]) ? result.embeddings[0] : result.embeddings;
  } else {
    throw new Error("Unexpected HuggingFace response format");
  }

  if (embedding.length !== 512) {
    console.warn(`[BRAND_ORIGINAL] Expected 512-dim embedding, got ${embedding.length}`);
  }

  return embedding;
}

/**
 * Fallback: compute cosine similarity in JS when pgvector RPC is unavailable.
 */
function findMostSimilar(queryEmbedding, dbRows) {
  let bestSim = 0;
  let bestLabel = "";

  for (const row of dbRows) {
    try {
      let stored;
      if (typeof row.embedding === "string") {
        stored = JSON.parse(row.embedding.replace(/^\[/, "[").replace(/\]$/, "]"));
      } else if (Array.isArray(row.embedding)) {
        stored = row.embedding;
      } else {
        continue;
      }

      const sim = cosineSimilarity(queryEmbedding, stored);
      if (sim > bestSim) {
        bestSim = sim;
        bestLabel = row.label;
      }
    } catch {
      continue;
    }
  }

  return { similarity: bestSim, label: bestLabel };
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
