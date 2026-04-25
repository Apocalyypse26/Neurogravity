// ═══════════════════════════════════════════════════════
// Cache Middleware — Redis-backed response caching
// ═══════════════════════════════════════════════════════
import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redisClient = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

const DEFAULT_TTL = 300; // 5 minutes

/**
 * Create cache middleware.
 * @param {object} options
 * @param {number} options.ttl - Cache TTL in seconds
 * @param {string} options.cacheKey - Custom cache key generator
 */
export function createCache({ ttl = DEFAULT_TTL } = {}) {
  return async function cache(req, res, next) {
    // Only cache GET requests
    if (req.method !== "GET" || !redisClient) {
      return next();
    }

    const cacheKey = `cache:${req.originalUrl}`;

    try {
      // Check cache
      const cached = await redisClient.get(cacheKey);

      if (cached) {
        console.log(`[CACHE] HIT ${req.originalUrl}`);
        return res.set("X-Cache", "HIT").json(cached);
      }

      console.log(`[CACHE] MISS ${req.originalUrl}`);

      // Capture original json method
      const originalJson = res.json.bind(res);

      // Override json to cache response
      res.json = async function (body) {
        // Only cache 2xx responses
        if (res.statusCode >= 200 && res.statusCode < 300 && body) {
          await redisClient.set(cacheKey, body, { ex: ttl });
          res.set("X-Cache", "MISS");
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      console.warn("[CACHE] Error:", err.message);
      next();
    }
  };
}

/**
 * Invalidate cache for a specific pattern.
 */
export async function invalidateCache(pattern) {
  if (!redisClient) return;

  try {
    const keys = await redisClient.keys(`cache:${pattern}*`);
    if (keys.length > 0) {
      await redisClient.del(...keys);
      console.log(`[CACHE] Invalidated ${keys.length} keys matching ${pattern}`);
    }
  } catch (err) {
    console.warn("[CACHE] Invalidation error:", err.message);
  }
}

export const defaultCache = createCache({ ttl: 300 });