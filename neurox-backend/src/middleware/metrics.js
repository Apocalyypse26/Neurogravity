// ═══════════════════════════════════════════════════════
// Prometheus Metrics Middleware
// ═══════════════════════════════════════════════════════
import client from "prom-client";

const register = new client.Registry();

register.setDefaultLabels({
  app: "neurox-backend",
  version: "2.5",
});

client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

const scansTotal = new client.Counter({
  name: "neurox_scans_total",
  help: "Total number of image scans performed",
  labelNames: ["input_type", "status"],
  registers: [register],
});

const scansDuration = new client.Histogram({
  name: "neurox_scan_duration_seconds",
  help: "Duration of scan processing in seconds",
  labelNames: ["input_type"],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export function metricsMiddleware(req, res, next) {
  if (req.path === "/metrics") {
    return res.set("Content-Type", register.contentType).send(register.metrics());
  }
  next();
}

export function trackRequest(method, route, status) {
  httpRequestsTotal.inc({ method, route, status });
}

export function trackDuration(method, route, status, duration) {
  httpRequestDuration.observe({ method, route, status }, duration);
}

export function trackScan(inputType, status) {
  scansTotal.inc({ input_type: inputType, status });
}

export function trackScanDuration(inputType, duration) {
  scansDuration.observe({ input_type: inputType }, duration);
}

export { register };