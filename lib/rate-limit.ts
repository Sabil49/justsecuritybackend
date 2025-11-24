// lib/rate-limit.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
   url: process.env.UPSTASH_REDIS_URL,
   token: process.env.UPSTASH_REDIS_TOKEN,
});
if (!process.env.UPSTASH_REDIS_URL || !process.env.UPSTASH_REDIS_TOKEN) {
  throw new Error('Missing required environment variables: UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN');
}

const rateLimitScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local windowStart = now - (window * 1000)

redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
local currentCount = redis.call('ZCARD', key)

if currentCount >= limit then
  return {0, 0}
end

redis.call('ZADD', key, now, now .. ':' .. redis.call('INCR', key .. ':counter'))
redis.call('EXPIRE', key, window)

return {1, limit - currentCount - 1}
`;

export async function rateLimit(
  identifier: string,
  limit: number = 100,
  window: number = 60
): Promise<{ success: boolean; remaining: number }> {
  const key = `rate_limit:${identifier}`;
  const now = Date.now();

  const result = await redis.eval(
    rateLimitScript,
    [key],
    [now, window, limit]
  ) as [number, number];

  return {
    success: result[0] === 1,
    remaining: result[1]
  };
}