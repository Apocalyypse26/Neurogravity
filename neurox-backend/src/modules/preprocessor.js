// ═══════════════════════════════════════════════════════
// Preprocessor Module — Step 1 of scan pipeline
// Validates, resizes, hashes, caches, and uploads images
// ═══════════════════════════════════════════════════════
import sharp from "sharp";
import { generatePHash } from "../utils/phash.js";
import { redis, CACHE_TTL } from "../services/redis.js";
import { uploadToR2 } from "../services/r2.js";
import { generateScanId } from "../utils/formatter.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Preprocess an image buffer through the full pipeline.
 *
 * a) Validate file size and MIME type
 * b) Resize to 512x512 (preserve aspect, pad with black)
 * c) Generate pHash
 * d) Check Redis cache for existing scan
 * e) Check quality flags
 * f) Upload to R2
 * g) Return preprocessed data
 *
 * @param {Buffer} imageBuffer   - Raw image buffer
 * @param {string} mimeType      - MIME type string
 * @param {number} originalSize  - Original file size in bytes
 * @returns {Promise<object>} Preprocessed result
 */
export async function preprocess(imageBuffer, mimeType, originalSize) {
  // ── a) Validate ──────────────────────────────────────
  if (!imageBuffer || imageBuffer.length === 0) {
    throw Object.assign(new Error("Empty file received"), { statusCode: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw Object.assign(
      new Error(`Unsupported file type: ${mimeType}. Accepted: PNG, JPEG, WebP, GIF`),
      { statusCode: 400 }
    );
  }

  if (originalSize > MAX_FILE_SIZE) {
    throw Object.assign(new Error("File exceeds 10MB limit"), { statusCode: 400 });
  }

  // ── b) Resize to 512x512 with black padding ─────────
  const resizedBuffer = await sharp(imageBuffer)
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .webp({ quality: 85 })
    .toBuffer();

  // ── c) Generate pHash ───────────────────────────────
  const phash = await generatePHash(resizedBuffer);

  // ── d) Check Redis cache ────────────────────────────
  if (redis) {
    try {
      const cached = await redis.get(`scan:${phash}`);
      if (cached) {
        const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
        return {
          cached: true,
          cachedResult: parsed,
          phash,
        };
      }
    } catch (err) {
      console.warn("[PREPROCESSOR] Redis cache check failed:", err.message);
    }
  }

  // ── e) Quality flags ────────────────────────────────
  const qualityFlags = [];
  const metadata = await sharp(imageBuffer).metadata();

  if (metadata.width < 100 || metadata.height < 100) {
    qualityFlags.push("low_resolution");
  }

  if (originalSize < 5 * 1024) {
    qualityFlags.push("suspiciously_small");
  }

  // ── f) Upload to R2 ────────────────────────────────
  const scanId = generateScanId();
  const timestamp = Date.now();
  const r2Key = `scans/${scanId}/${timestamp}.webp`;

  let r2Url = null;
  try {
    r2Url = await uploadToR2(resizedBuffer, r2Key, "image/webp");
  } catch (err) {
    console.warn("[PREPROCESSOR] R2 upload failed:", err.message);
    // non-fatal — scan can continue without R2
  }

  // ── g) Return preprocessed data ─────────────────────
  return {
    cached: false,
    resizedBuffer,
    phash,
    scanId,
    qualityFlags,
    r2Url: r2Url ? r2Key : null,
    originalWidth: metadata.width,
    originalHeight: metadata.height,
    originalSize,
  };
}
