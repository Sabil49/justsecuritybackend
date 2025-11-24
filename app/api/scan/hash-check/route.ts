// app/api/scan/hash-check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { Redis } from '@upstash/redis';

if (!process.env.UPSTASH_REDIS_URL || !process.env.UPSTASH_REDIS_TOKEN) {
  throw new Error('Missing required Redis environment variables');
}
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

const HashCheckSchema = z.object({
  hashes: z.array(z.string().length(64)).min(1).max(100), // SHA-256 hashes
  deviceId: z.string(),
});

interface ThreatResult {
  hash: string;
  isThreat: boolean;
  threatName?: string;
  severity?: string;
  category?: string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request);
    
    // Rate limit: 50 requests per minute per user
    const { success } = await rateLimit(`hash_check:${user.userId}`, 50, 60);
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validated = HashCheckSchema.parse(body);

    // Verify device belongs to user
    const device = await prisma.device.findFirst({
      where: {
        id: validated.deviceId,
        userId: user.userId,
      },
    });

    if (!device) {
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 }
      );
    }

    const results: ThreatResult[] = [];
    const uncachedHashes: string[] = [];

    // Check cache first
      try {
      const cacheKeys = validated.hashes.map(h => `threat:${h}`);
      const cachedResults = await redis.mget<(ThreatResult | null)[]>(...cacheKeys);
      
      validated.hashes.forEach((hash, index) => {
        if (cachedResults[index]) {
          results.push(cachedResults[index]);
        } else {
          uncachedHashes.push(hash);
        }
      });
    } catch (redisError) {
      console.error('[REDIS_ERROR]', redisError);
      // Fall back to checking all hashes from DB
      uncachedHashes.push(...validated.hashes);
    }    // Query database for uncached hashes
    if (uncachedHashes.length > 0) {
      type ThreatRow = {
        signature: string;
        threatName?: string | null;
        severity?: string | null;
        category?: string | null;
      };

      const threats = await prisma.threatSignature.findMany({
        where: {
          signature: { in: uncachedHashes },
          type: 'HASH',
          isActive: true,
        },
        select: {
          signature: true,
          threatName: true,
          severity: true,
          category: true,
        },
      }) as ThreatRow[];

      const threatMap = new Map<string, ThreatRow>(
        threats.map((t) => [t.signature, t])
      );
       const pipeline = redis.pipeline();
      for (const hash of uncachedHashes) {
        const threat = threatMap.get(hash);
        const result: ThreatResult = threat
          ? {
              hash,
              isThreat: true,
              threatName: threat?.threatName ?? undefined,
              severity: threat?.severity ?? undefined,
              category: threat?.category ?? undefined,
            }
          : {
              hash,
              isThreat: false,
            };

        results.push(result);

        // Cache result for 1 hour (store as JSON string)
         pipeline.setex(`threat:${hash}`, 3600, JSON.stringify(result));
    }

    await pipeline.exec();

    // Log scan activity
    const threatsFound = results.filter(r => r.isThreat).length;
    
    if (threatsFound > 0) {
      await prisma.telemetryLog.create({
        data: {
          userId: user.userId,
          eventType: 'threats_detected',
          eventData: {
            deviceId: device.id,
            count: threatsFound,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        scanned: validated.hashes.length,
        threatsFound,
      },
    });
  } catch (error) {
    console.error('[HASH_CHECK_ERROR]', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Hash check failed' },
      { status: 500 }
    );
  }
}