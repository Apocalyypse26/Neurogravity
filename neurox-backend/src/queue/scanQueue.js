// ═══════════════════════════════════════════════════════
// Scan Queue — BullMQ job queue backed by Upstash Redis
// Handles async scan processing with retries
// ═══════════════════════════════════════════════════════
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { preprocess } from "../modules/preprocessor.js";
import { scoreWithGPT } from "../modules/gptScorer.js";
import { checkBrandOriginality } from "../modules/brandOriginal.js";
import { checkVisualConsistency } from "../modules/visualConsist.js";
import { aggregate } from "../modules/aggregator.js";
import { formatScanResult } from "../utils/formatter.js";
import { supabase } from "../services/supabase.js";
import { redis, CACHE_TTL } from "../services/redis.js";

// ── Redis connection for BullMQ ───────────────────────
// BullMQ requires ioredis; Upstash REST works with the @upstash/redis SDK,
// but BullMQ needs a raw Redis connection. For Upstash compatibility,
// we configure ioredis with TLS and the Upstash Redis URL.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || "";
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || "";

let connection = null;

// Parse Upstash REST URL into an ioredis-compatible connection
// Upstash Redis URLs typically look like: https://xxx.upstash.io
// For ioredis we need: rediss://default:token@xxx.upstash.io:6379
if (redisUrl && redisToken) {
  try {
    const host = redisUrl.replace("https://", "").replace("http://", "");
    connection = new IORedis({
      host,
      port: 6379,
      password: redisToken,
      tls: { rejectUnauthorized: false },
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    connection.on("error", (err) => {
      console.warn("[QUEUE] Redis connection error:", err.message);
    });
  } catch (err) {
    console.warn("[QUEUE] Failed to create Redis connection:", err.message);
  }
}

// ── Queue Setup ──────────────────────────────────────
const QUEUE_NAME = "neurox-scans";

export const scanQueue = connection
  ? new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    })
  : null;

/**
 * Add a scan job to the queue.
 *
 * @param {object} jobData
 * @param {Buffer} jobData.imageBuffer
 * @param {string} jobData.mimeType
 * @param {number} jobData.originalSize
 * @param {string} jobData.inputType     - 'image' | 'url'
 * @param {string} [jobData.inputUrl]    - Original URL if url scan
 * @param {Buffer[]} [jobData.extraBuffers] - Additional images for URL scans
 * @returns {Promise<string>} Job ID
 */
export async function addScanJob(jobData) {
  if (!scanQueue) {
    console.warn("[QUEUE] No Redis connection — processing synchronously (no retries, no job tracking)");
    const result = await processScanJob({ data: serializeJobData(jobData) });
    return result?.scan_id || "sync-scan";
  }

  const serialized = serializeJobData(jobData);
  const job = await scanQueue.add("scan", serialized);
  return job.id;
}

/**
 * Serialize job data for queue transfer (buffers → base64).
 */
function serializeJobData(jobData) {
  return {
    imageBase64: jobData.imageBuffer.toString("base64"),
    mimeType: jobData.mimeType,
    originalSize: jobData.originalSize,
    inputType: jobData.inputType,
    inputUrl: jobData.inputUrl || null,
    extraBuffersBase64: (jobData.extraBuffers || []).map((b) => b.toString("base64")),
  };
}

/**
 * Process a scan job through the full pipeline.
 * Used by BullMQ worker AND as direct synchronous processor.
 *
 * @param {object} job - BullMQ job object with .data
 * @returns {Promise<object>} Final scan result
 */
export async function processScanJob(job) {
  const data = job.data;

  if (!data || typeof data.imageBase64 !== "string" || data.imageBase64.length === 0) {
    throw Object.assign(new Error("Invalid job data: imageBase64 is missing or empty"), { statusCode: 400 });
  }

  const imageBuffer = Buffer.from(data.imageBase64, "base64");
  const extraBuffers = (data.extraBuffersBase64 || []).map((b) => Buffer.from(b, "base64"));

  console.log(`[QUEUE] Processing scan job — type: ${data.inputType}`);

  // ── Step 1: Preprocess ──────────────────────────────
  const preprocessed = await preprocess(imageBuffer, data.mimeType, data.originalSize);

  if (preprocessed.cached) {
    console.log(`[QUEUE] Cache hit for pHash: ${preprocessed.phash}`);
    return {
      ...preprocessed.cachedResult,
      platform_data: {
        ...preprocessed.cachedResult.platform_data,
        cache_hit: true,
        duplicate_detected: true,
      },
    };
  }

  const { resizedBuffer, phash, scanId, qualityFlags, r2Url } = preprocessed;

  // ── Step 2: GPT-4o mini scoring ─────────────────────
  const gptResult = await scoreWithGPT(resizedBuffer);
  console.log(`[QUEUE] GPT scores — scam: ${gptResult.scam_risk}, quality: ${gptResult.launch_quality}`);

  // ── Step 3: Brand originality ───────────────────────
  const brandResult = await checkBrandOriginality(resizedBuffer, scanId);
  console.log(`[QUEUE] Brand originality: ${brandResult.brand_originality}`);

  // ── Step 4: Visual consistency ──────────────────────
  const allBuffers = [resizedBuffer, ...extraBuffers];
  const consistResult = await checkVisualConsistency(allBuffers);
  console.log(`[QUEUE] Visual consistency: ${consistResult.visual_consistency}`);

  // ── Step 5: Aggregate ──────────────────────────────
  const allScores = {
    scam_risk: gptResult.scam_risk,
    claim_credibility: gptResult.claim_credibility,
    hype_manipulation: gptResult.hype_manipulation,
    launch_quality: gptResult.launch_quality,
    brand_originality: brandResult.brand_originality,
    visual_consistency: consistResult.visual_consistency,
  };

  const { trustScore, riskLevel, verdict, recommendation } = aggregate(allScores);

  // Combine all flags
  const allFlags = [
    ...(gptResult.scam_flags || []),
    ...(gptResult.claim_flags || []),
    ...(gptResult.hype_flags || []),
    ...(brandResult.flags || []),
    ...(consistResult.flags || []),
  ].filter((f) => f && f !== "analysis_failed");

  // ── Format final result ────────────────────────────
  const scanResult = formatScanResult({
    scanId,
    trustScore,
    riskLevel,
    verdict,
    scores: allScores,
    flags: allFlags,
    recommendation,
    ocrText: gptResult.ocr_text,
    platformData: {
      input_type: data.inputType,
      analyzed_assets: allBuffers.length,
      duplicate_detected: false,
      cache_hit: false,
      quality_flags: qualityFlags,
    },
  });

  // ── Persist to Supabase ────────────────────────────
  try {
    await supabase.from("scans").insert({
      scan_id: scanId,
      image_hash: phash,
      input_type: data.inputType,
      input_url: data.inputUrl,
      trust_score: trustScore,
      risk_level: riskLevel,
      verdict,
      scores: allScores,
      flags: allFlags,
      recommendation,
      ocr_text: gptResult.ocr_text,
    });
    console.log(`[QUEUE] Scan ${scanId} persisted to database`);
  } catch (err) {
    console.error("[QUEUE] Failed to persist scan:", err.message);
  }

  // ── Cache result in Redis ──────────────────────────
  if (redis) {
    try {
      await redis.set(`scan:${phash}`, JSON.stringify(scanResult), { ex: CACHE_TTL });
      console.log(`[QUEUE] Cached scan result for pHash: ${phash}`);
    } catch (err) {
      console.warn("[QUEUE] Failed to cache result:", err.message);
    }
  }

  console.log(`[QUEUE] Scan complete — ${scanId} → trust: ${trustScore} (${riskLevel})`);
  return scanResult;
}

// ── BullMQ Worker ────────────────────────────────────
let worker = null;

export function startWorker() {
  if (!connection) {
    console.warn("[QUEUE] No Redis connection — worker not started (using sync processing)");
    return;
  }

  worker = new Worker(QUEUE_NAME, processScanJob, {
    connection,
    concurrency: 2,
    limiter: { max: 5, duration: 60000 }, // max 5 jobs per minute
  });

  worker.on("completed", (job, result) => {
    console.log(`[WORKER] Job ${job.id} completed — scan: ${result?.scan_id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[WORKER] Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[WORKER] Error:", err.message);
  });

  console.log("[WORKER] Scan worker started (concurrency: 2)");
}

export function stopWorker() {
  if (worker) {
    worker.close();
    worker = null;
  }
  if (connection) {
    connection.disconnect();
  }
}
