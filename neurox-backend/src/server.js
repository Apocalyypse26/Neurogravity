// ═══════════════════════════════════════════════════════
// NEUROX Backend — Express Application Entry Point
// Crypto Token Visual Trust Scoring Engine v2.5
// ═══════════════════════════════════════════════════════
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import scanRoutes from "./routes/scan.js";
import { startWorker, stopWorker } from "./queue/scanQueue.js";
import { closeBrowser } from "./services/scraper.js";
import { standardLimiter, strictLimiter } from "./middleware/rateLimit.js";
import { createLoggerMiddleware } from "./middleware/logger.js";
import { metricsMiddleware } from "./middleware/metrics.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { startCronJobs, stopCronJobs } from "./jobs/cron.js";

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ── Request Logging ──────────────────────────────────
app.use(requestIdMiddleware);
app.use(createLoggerMiddleware());
app.use(metricsMiddleware);

// ── Security & Parsing Middleware ─────────────────────
app.use(compression());
app.use(helmet());

// CORS: whitelist allowed origins from environment
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0
      ? allowedOrigins
      : false, // false = same-origin only in production if no whitelist
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// ── Request Logging ──────────────────────────────────
app.use((req, _res, next) => {
  const start = Date.now();
  const originalEnd = _res.end;
  _res.end = function (...args) {
    const duration = Date.now() - start;
    console.log(
      `[HTTP] ${req.method} ${req.originalUrl} → ${_res.statusCode} (${duration}ms)`
    );
    originalEnd.apply(this, args);
  };
  next();
});

// ── Health Check ─────────────────────────────────────
import { supabase } from "./services/supabase.js";

app.get("/api/health", async (_req, res) => {
  const checks = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {},
  };

  // Check Supabase
  try {
    const { error } = await supabase.from("scans").select("id").limit(1);
    checks.services.supabase = error ? { status: "unhealthy", error: error.message } : { status: "healthy" };
  } catch (err) {
    checks.services.supabase = { status: "unhealthy", error: err.message };
  }

  // Check Redis/Redis (Upstash)
  checks.services.redis = {
    status: process.env.UPSTASH_REDIS_REST_URL ? "configured" : "not_configured",
  };

  // Check OpenAI
  checks.services.openai = {
    status: process.env.OPENAI_API_KEY ? "configured" : "not_configured",
  };

  const allHealthy = Object.values(checks.services).every(
    (s) => s.status === "healthy" || s.status === "configured"
  );

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? "operational" : "degraded",
    version: "2.5",
    ...checks,
  });
});

// ── Scan Routes ──────────────────────────────────────
app.use("/api/scan", scanRoutes);

// ── 404 Handler ──────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global Error Handler ─────────────────────────────
app.use((err, _req, res, _next) => {
  // Multer file size error
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File exceeds 10MB limit" });
  }

  console.error("[ERROR]", err);
  const status = err.statusCode || 500;
  res.status(status).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

// ── Start Server ─────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log("═══════════════════════════════════════════");
  console.log(`  NEUROX Backend v2.5`);
  console.log(`  Trust Scoring Engine — Operational`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Env:  ${process.env.NODE_ENV || "development"}`);
  console.log("═══════════════════════════════════════════");

  // Start BullMQ worker for async scan processing
  startWorker();
  startCronJobs();
});

// ── Graceful Shutdown ────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[SHUTDOWN] ${signal} received — shutting down gracefully...`);

  server.close(async () => {
    console.log("[SHUTDOWN] HTTP server closed");

    try {
      stopCronJobs();
      console.log("[SHUTDOWN] Cron jobs stopped");
    } catch (err) {
      console.warn("[SHUTDOWN] Cron stop error:", err.message);
    }

    try {
      stopWorker();
      console.log("[SHUTDOWN] Queue worker stopped");
    } catch (err) {
      console.warn("[SHUTDOWN] Worker stop error:", err.message);
    }

    try {
      await closeBrowser();
      console.log("[SHUTDOWN] Playwright browser closed");
    } catch (err) {
      console.warn("[SHUTDOWN] Browser close error:", err.message);
    }

    console.log("[SHUTDOWN] Clean exit");
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error("[SHUTDOWN] Forced exit after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
