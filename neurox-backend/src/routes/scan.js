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

const router = Router();

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
router.post("/image", upload.single("image"), async (req, res) => {
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
router.post("/url", async (req, res) => {
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
router.get("/:scanId", async (req, res) => {
  try {
    const { scanId } = req.params;

    if (!scanId || !scanId.startsWith("NRX-")) {
      return res.status(400).json({
        error: "Invalid scan ID format. Expected: NRX-YYYYMMDD-XXXX",
      });
    }

    const { data, error } = await supabase
      .from("scans")
      .select("*")
      .eq("scan_id", scanId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Scan not found" });
    }

    // Reconstruct the full scan result format
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
        cache_hit: false,
        quality_flags: [],
      },
      timestamp: data.created_at,
    });
  } catch (err) {
    console.error("[SCAN] Lookup error:", err);
    return res.status(500).json({ error: "Failed to retrieve scan" });
  }
});

export default router;
