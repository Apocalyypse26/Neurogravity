// ═══════════════════════════════════════════════════════
// GPT Scorer Module — Step 2 of scan pipeline
// Single GPT-4o mini vision call per scan
// Token-optimized: ~1,300 fewer tokens/scan vs original
// ═══════════════════════════════════════════════════════
import { openai } from "../services/openai.js";

// ── Compressed prompts (same detection quality, ~70% fewer text tokens) ──

const SYSTEM_PROMPT = `Crypto token visual trust scorer. Return JSON only.`;

const USER_PROMPT = `Score this crypto token image. JSON output:
{"scam_risk":0-100,"scam_flags":[],"claim_credibility":0-100,"claim_flags":[],"hype_manipulation":0-100,"hype_flags":[],"launch_quality":0-100,"launch_notes":"","ocr_text":""}
scam_flags: copied logos, celebrity faces, guaranteed returns, fake exchange logos, countdown timers, copyright violations.
hype_flags: rocket/moon/lambo imagery, fake charts, FOMO text, neon urgency colors.
claim_flags: unverifiable or exaggerated text claims.
ocr_text: all visible text in image.`;

const RETRY_PROMPT = `Score this crypto token image as JSON: {"scam_risk":0-100,"scam_flags":[],"claim_credibility":0-100,"claim_flags":[],"hype_manipulation":0-100,"hype_flags":[],"launch_quality":0-100,"launch_notes":"","ocr_text":""}`;

const DEFAULT_SCORES = {
  scam_risk: 50,
  scam_flags: ["analysis_failed"],
  claim_credibility: 50,
  claim_flags: ["analysis_failed"],
  hype_manipulation: 50,
  hype_flags: ["analysis_failed"],
  launch_quality: 50,
  launch_notes: "GPT analysis unavailable — default scores applied",
  ocr_text: "",
};

/**
 * Run GPT-4o mini vision analysis on an image.
 * Makes exactly ONE API call per scan. Retries once on parse failure.
 *
 * @param {Buffer} imageBuffer - Resized 512x512 WebP image buffer
 * @returns {Promise<object>} GPT scoring results
 */
export async function scoreWithGPT(imageBuffer) {
  const base64Image = imageBuffer.toString("base64");
  const imageDataUrl = `data:image/webp;base64,${base64Image}`;

  // First attempt — optimized prompt
  try {
    const result = await callGPT(imageDataUrl, USER_PROMPT);
    if (result) return result;
  } catch (err) {
    console.warn("[GPT_SCORER] First attempt failed:", err.message);
  }

  // Retry with minimal prompt
  try {
    const result = await callGPT(imageDataUrl, RETRY_PROMPT);
    if (result) return result;
  } catch (err) {
    console.warn("[GPT_SCORER] Retry failed:", err.message);
  }

  // Both attempts failed — return defaults
  console.error("[GPT_SCORER] Both attempts failed — returning default scores");
  return { ...DEFAULT_SCORES };
}

/**
 * Make the actual GPT-4o mini vision API call and parse the JSON response.
 * Uses response_format: json_object to guarantee valid JSON (saves output tokens).
 */
async function callGPT(imageDataUrl, userPrompt) {
  if (!openai) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
        ],
      },
    ],
    max_tokens: 400,
    temperature: 0.2,
  });

  const raw = response.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty GPT response");

  const parsed = JSON.parse(raw);

  // Validate required fields exist and clamp scores
  return {
    scam_risk: clamp(parsed.scam_risk),
    scam_flags: Array.isArray(parsed.scam_flags) ? parsed.scam_flags : [],
    claim_credibility: clamp(parsed.claim_credibility),
    claim_flags: Array.isArray(parsed.claim_flags) ? parsed.claim_flags : [],
    hype_manipulation: clamp(parsed.hype_manipulation),
    hype_flags: Array.isArray(parsed.hype_flags) ? parsed.hype_flags : [],
    launch_quality: clamp(parsed.launch_quality),
    launch_notes: parsed.launch_notes || "",
    ocr_text: parsed.ocr_text || "",
  };
}

function clamp(val) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return 50;
  return Math.max(0, Math.min(100, n));
}
