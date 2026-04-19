// ═══════════════════════════════════════════════════════
// Upstash Redis Client — REST-based caching layer
// ═══════════════════════════════════════════════════════
import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  console.warn("[REDIS] Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN — caching disabled");
}

export const redis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

/**
 * Cache TTL in seconds (24 hours)
 */
export const CACHE_TTL = 86400;
