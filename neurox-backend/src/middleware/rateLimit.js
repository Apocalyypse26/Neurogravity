// ═══════════════════════════════════════════════════════
// Rate Limiting Middleware — In-memory + Redis-backed
// ═══════════════════════════════════════════════════════
import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redisClient = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

// Default limits
const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 30; // 30 requests per minute

/**
 * Create rate limiter middleware.
 * @param {object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Max requests per window
 * @param {string} options.keyPrefix - Redis key prefix
 * @param {string} options.message - Error message when rate limited
 */
export function createRateLimiter({
  windowMs = DEFAULT_WINDOW_MS,
  max = DEFAULT_MAX_REQUESTS,
  keyPrefix = "rl:",
  message = "Too many requests, please slow down",
} = {}) {
  return async function rateLimiter(req, res, next) {
    // Use IP + path as key
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const path = req.path;
    const key = `${keyPrefix}${ip}:${path}`;

    try {
      if (redisClient) {
        // Redis-backed: atomic increment with TTL
        const windowSecs = Math.ceil(windowMs / 1000);
        const current = await redisClient.incr(key);

        if (current === 1) {
          await redisClient.expire(key, windowSecs);
        }

        if (current > max) {
          const ttl = await redisClient.ttl(key);
          res.set("Retry-After", ttl > 0 ? ttl.toString() : windowSecs.toString());
          return res.status(429).json({ error: message });
        }

        res.set("X-RateLimit-Limit", max.toString());
        res.set("X-RateLimit-Remaining", Math.max(0, max - current).toString());
      } else {
        // Fallback: in-memory (not shared across instances)
        if (!rateLimiter.cache) {
          rateLimiter.cache = new Map();
        }

        const now = Date.now();
        const windowStart = now - windowMs;
        const record = rateLimiter.cache.get(key) || { count: 0, startTime: now };

        // Clean old entries periodically
        if (rateLimiter.cache.size > 10000) {
          for (const [k, v] of rateLimiter.cache) {
            if (v.startTime < windowStart) {
              rateLimiter.cache.delete(k);
            }
          }
        }

        // Reset if window expired
        if (record.startTime < windowStart) {
          record.count = 0;
          record.startTime = now;
        }

        record.count++;
        rateLimiter.cache.set(key, record);

        if (record.count > max) {
          return res.status(429).json({ error: message });
        }

        res.set("X-RateLimit-Limit", max.toString());
        res.set("X-RateLimit-Remaining", Math.max(0, max - record.count).toString());
      }

      next();
    } catch (err) {
      // Don't block request if rate limiting fails
      console.warn("[RATELIMIT] Error:", err.message);
      next();
    }
  };
}

// Pre-configured limiters
export const strictLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: "rl:strict:",
  message: "Strict rate limit: max 10 requests per minute",
});

export const scanLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  keyPrefix: "rl:scan:",
  message: "Scan rate limit: max 5 scans per minute",
});

export const standardLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: "rl:",
  message: "Too many requests, please slow down",
});
