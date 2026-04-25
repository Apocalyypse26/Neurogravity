// ═══════════════════════════════════════════════════════
// Request Logging Middleware — Structured JSON logging
// ═══════════════════════════════════════════════════════
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

function createLoggerMiddleware() {
  return async function logRequest(req, res, next) {
    const start = Date.now();
    const requestId = req.headers["x-request-id"] || crypto.randomUUID();

    req.requestId = requestId;

    const log = logger.child({
      requestId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers["user-agent"],
    });

    log.info({ status: "started" });

    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
      res.end = originalEnd;
      res.end.apply(res, arguments);

      const duration = Date.now() - start;

      log.info({
        status: "completed",
        statusCode: res.statusCode,
        duration,
      });

      if (res.statusCode >= 500) {
        log.error({ statusCode: res.statusCode }, "Request failed");
      } else if (res.statusCode >= 400) {
        log.warn({ statusCode: res.statusCode }, "Client error");
      }
    };

    next();
  };
}

export { logger, createLoggerMiddleware };