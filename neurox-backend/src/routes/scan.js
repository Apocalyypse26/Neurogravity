// ═══════════════════════════════════════════════════════
// Scan Routes — All scan API endpoints
// POST /api/scan/image, POST /api/scan/url, GET /api/scan/:scanId
// ═══════════════════════════════════════════════════════
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { processScanJob } from "../queue/scanQueue.js";
import { supabase } from "../services/supabase.js";
import { scrapeUrl } from "../services/scraper.js";
import { strictLimiter, scanLimiter, standardLimiter } from "../middleware/rateLimit.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { createCache } from "../middleware/cache.js";
import { validateSync } from "../middleware/validate.js";
import { scanUrlSchema, scanHistoryQuerySchema } from "../middleware/validate.js";
import { getCachedScan, setCachedScan } from "../cache/l1.js";

const router = Router();

// API Version constant
const API_VERSION = "v1";

// ── Multer config — 10MB limit, memory storage ───────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    if (allowed.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        Object.assign(
          new Error(`Unsupported file type: ${file.mimetype}. Accepted: PNG, JPEG, WebP, GIF`),
          { statusCode: 400 }
        )
      );
    }
  },
});

// ═══════════════════════════════════════════════════════
// POST /api/scan/image
// Accepts multipart/form-data with field "image"
// ═══════════════════════════════════════════════════════
router.post("/image", strictLimiter, authenticate, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No image file provided. Send a file in the 'image' field.",
      });
    }

    console.log(
      `[SCAN] Image upload received — ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)}KB, ${req.file.mimetype})`
    );

    const result = await processScanJob({
      data: {
        imageBase64: req.file.buffer.toString("base64"),
        mimeType: req.file.mimetype,
        originalSize: req.file.size,
        inputType: "image",
        inputUrl: null,
        extraBuffersBase64: [],
      },
    });

    return res.json(result);
  } catch (err) {
    console.error("[SCAN] Image scan error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message || "Internal scan error",
    });
  }
});

// ═══════════════════════════════════════════════════════
// POST /api/scan/url
// Accepts JSON body { "url": "https://..." }
// Scrapes logo, banner, and social post images, then scans
// ═══════════════════════════════════════════════════════
router.post("/url", scanLimiter, authenticate, validateSync(scanUrlSchema, "body"), async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        error: "Missing or invalid 'url' field. Provide a valid URL string.",
      });
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    console.log(`[SCAN] URL scan requested — ${url}`);

    // Scrape visual assets from the URL
    const { images, metadata } = await scrapeUrl(url);

    if (images.length === 0) {
      return res.status(422).json({
        error: "No visual assets could be extracted from the provided URL.",
        metadata,
      });
    }

    console.log(`[SCAN] Scraped ${images.length} assets from ${url}`);

    // Use the first image as primary, rest as extras for consistency check
    const primaryBuffer = images[0];
    const extraBuffers = images.slice(1);

    // Detect MIME type of primary image using sharp
    const sharpMeta = await sharp(primaryBuffer).metadata();
    const mimeMap = {
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/png", // convert SVG to PNG for processing
    };
    const mimeType = mimeMap[sharpMeta.format] || "image/png";

    const result = await processScanJob({
      data: {
        imageBase64: primaryBuffer.toString("base64"),
        mimeType,
        originalSize: primaryBuffer.length,
        inputType: "url",
        inputUrl: url,
        extraBuffersBase64: extraBuffers.map((b) => b.toString("base64")),
      },
    });

    // Override platform_data with URL-specific info
    result.platform_data = {
      ...result.platform_data,
      input_type: "url",
      analyzed_assets: images.length,
      scraped_from: url,
    };

    return res.json(result);
  } catch (err) {
    console.error("[SCAN] URL scan error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message || "Internal scan error",
    });
  }
});

// ═══════════════════════════════════════════════════════
// GET /api/scan/:scanId
// Returns a previously stored scan result by scan_id
// ═══════════════════════════════════════════════════════
router.get("/:scanId", createCache({ ttl: 600 }), standardLimiter, optionalAuth, async (req, res) => {
  try {
    const { scanId } = req.params;

    if (!scanId || !scanId.startsWith("NRX-")) {
      return res.status(400).json({
        error: "Invalid scan ID format. Expected: NRX-YYYYMMDD-XXXX",
      });
    }

    const { data, source } = await getCachedScan(scanId);

    if (!data) {
      return res.status(404).json({ error: "Scan not found" });
    }

    const cacheHit = source !== "L3";

    return res.json({
      scan_id: data.scan_id,
      trust_score: data.trust_score,
      risk_level: data.risk_level,
      verdict: data.verdict,
      scores: data.scores,
      flags: data.flags,
      recommendation: data.recommendation,
      ocr_text: data.ocr_text,
      platform_data: {
        input_type: data.input_type,
        analyzed_assets: 1,
        duplicate_detected: false,
        cache_hit: cacheHit,
        quality_flags: [],
      },
      timestamp: data.created_at,
    });
  } catch (err) {
    console.error("[SCAN] Lookup error:", err);
    return res.status(500).json({ error: "Failed to retrieve scan" });
  }
});

// ═══════════════════════════════════════════════════════
// GET /api/scan/history
// Returns scan history for authenticated user with pagination
// ═══════════════════════════════════════════════════════
router.get("/history", createCache({ ttl: 60 }), validateSync(scanHistoryQuerySchema, "query"), standardLimiter, optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required for history" });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from("scans")
      .select("scan_id, trust_score, risk_level, verdict, created_at, input_type", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: "Failed to retrieve scan history" });
    }

    const totalPages = Math.ceil(count / limit);

    return res.json({
      api_version: API_VERSION,
      data,
      pagination: {
        page,
        limit,
        total: count,
        total_pages: totalPages,
        has_more: page < totalPages,
      },
    });
  } catch (err) {
    console.error("[SCAN] History error:", err);
    return res.status(500).json({ error: "Failed to retrieve scan history" });
  }
});

export default router;

// ── Legacy/v1 alias for backward compatibility ─────
// This allows clients to use /api/scan without version prefix
export { API_VERSION };
