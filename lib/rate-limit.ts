// lib/rate-limit.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

export async function rateLimit(
  identifier: string,
  limit: number = 100,
  window: number = 60
): Promise<{ success: boolean; remaining: number }> {
  const key = `rate_limit:${identifier}`;
  const now = Date.now();
  const windowStart = now - window * 1000;

  // Remove old entries
  await redis.zremrangebyscore(key, 0, windowStart);

  // Count current requests
  const currentCount = await redis.zcard(key);

  if (currentCount >= limit) {
    return { success: false, remaining: 0 };
  }

  // Add current request
  await redis.zadd(key, { score: now, member: `${now}` });
  await redis.expire(key, window);

  return { success: true, remaining: limit - currentCount - 1 };
}