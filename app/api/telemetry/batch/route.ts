// app/api/telemetry/batch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { InputJsonValue } from '@prisma/client/runtime/client';
const TelemetryBatchSchema = z.object({
  events: z.array(z.object({
    eventType: z.string(),
    eventData: z.record(z.any(),z.unknown()),
    timestamp: z.iso.datetime()
  })),
  deviceId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request);

    // Rate limit: 100 requests per hour
    const { success } = await rateLimit(`telemetry:${user.userId}`, 100, 3600);
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validated = TelemetryBatchSchema.parse(body);

    // Verify device ownership
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

    // Batch insert telemetry logs
    const result = await prisma.telemetryLog.createMany({
      data: validated.events.map(event => ({
        userId: user.userId,
        deviceId: validated.deviceId,
        eventType: event.eventType,
        eventData: event.eventData as unknown as InputJsonValue,
        timestamp: new Date(event.timestamp),
      })),
    });

    return NextResponse.json({
      success: true,
      data: { eventsProcessed: result.count },
    });
  } catch (error) {
    console.error('[TELEMETRY_BATCH_ERROR]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Telemetry processing failed' },
      { status: 500 }
    );
  }
}