// lib/rate-limit.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

// Lua script for atomic rate limiting
const rateLimitScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local windowStart = now - (window * 1000)

-- Remove old entries
redis.call('zremrangebyscore', key, 0, windowStart)

-- Count current requests
local currentCount = redis.call('zcard', key)

if currentCount >= limit then
  return {0, 0}
end

-- Add current request with unique member
local member = now .. ':' .. redis.call('incr', key .. ':counter')
redis.call('zadd', key, now, member)
redis.call('expire', key, window)
redis.call('expire', key .. ':counter', window)
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