// ═══════════════════════════════════════════════════════
// Cron Jobs — Scheduled cleanup and maintenance
// ═══════════════════════════════════════════════════════
import { redis } from "../services/redis.js";

const CRON_INTERVALS = {
  REDIS_CLEANUP: 60 * 60 * 1000, // 1 hour
  STALE_CACHE_CLEANUP: 15 * 60 * 1000, // 15 minutes
};

const jobs = new Map();

export function startCronJobs() {
  console.log("[CRON] Starting scheduled jobs...");

  // Redis cleanup - flush old entries
  const redisCleanup = setInterval(async () => {
    if (!redis) return;

    try {
      const cleaned = await redis.cleanup();
      console.log(`[CRON] Redis GC: ${cleaned} keys removed`);
    } catch (err) {
      console.warn("[CRON] Redis cleanup failed:", err.message);
    }
  }, CRON_INTERVALS.REDIS_CLEANUP);

  jobs.set("redisCleanup", redisCleanup);

  // Stale cache cleanup
  const cacheCleanup = setInterval(async () => {
    if (!redis) return;

    try {
      const keys = await redis.keys("cache:*");
      let removed = 0;

      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl <= 0) {
          await redis.del(key);
          removed++;
        }
      }

      if (removed > 0) {
        console.log(`[CRON] Cache cleanup: ${removed} stale entries removed`);
      }
    } catch (err) {
      console.warn("[CRON] Cache cleanup failed:", err.message);
    }
  }, CRON_INTERVALS.STALE_CACHE_CLEANUP);

  jobs.set("cacheCleanup", cacheCleanup);

  console.log("[CRON] All jobs started");
}

export function stopCronJobs() {
  console.log("[CRON] Stopping scheduled jobs...");

  for (const [name, interval] of jobs) {
    clearInterval(interval);
    console.log(`[CRON] Stopped: ${name}`);
  }

  jobs.clear();
}