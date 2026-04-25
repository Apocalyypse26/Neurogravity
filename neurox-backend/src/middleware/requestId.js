// ═══════════════════════════════════════════════════════
// Request ID Middleware — Generates and tracks request IDs
// ═══════════════════════════════════════════════════════
import { randomUUID } from "crypto";

export function requestIdMiddleware(req, res, next) {
  const id = req.headers["x-request-id"] || randomUUID();
  req.requestId = id;
  res.set("X-Request-ID", id);
  next();
}