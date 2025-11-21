

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { InputJsonValue } from '@prisma/client/runtime/library';

export const runtime = 'nodejs';

const DeviceCommandSchema = z.object({
  deviceId: z.string().min(1),
  commandType: z.enum(['locate', 'ring', 'lock', 'wipe']),
  metadata: z
    .object({
      lockMessage: z.string().optional(),
      phoneNumber: z.string().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request);

    // Rate limit user
    const { success } = await rateLimit(
      `device_command:${user.userId}`,
      10,
      3600
    );

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many commands. Please try again later.',
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validated = DeviceCommandSchema.parse(body);

    // Ensure user owns this device
    const device = await prisma.device.findFirst({
      where: {
        id: validated.deviceId,
        userId: user.userId,
        isActive: true,
      },
      include: {
        pushTokens: {
          where: { isActive: true },
        },
      },
    });

    if (!device) {
      return NextResponse.json(
        { success: false, error: 'Device not found or inactive' },
        { status: 404 }
      );
    }

    if (device.pushTokens.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Device has no active push tokens' },
        { status: 400 }
      );
    }

    // Normalize metadata (safe for Prisma JSON)
    const metadata: Record<string, unknown> = validated.metadata ?? {};

    // Create pending command
    const command = await prisma.antiTheftCommand.create({
      data: {
        deviceId: device.id,
        commandType: validated.commandType,
        status: 'pending',
        issuedBy: user.userId,
        metadata: metadata as InputJsonValue,
      },
    });

    // Update to 'sent'
    await prisma.antiTheftCommand.update({
      where: { id: command.id },
      data: {
        status: 'sent',
      },
    });

    // Telemetry log
    await prisma.telemetryLog.create({
      data: {
        userId: user.userId,
        eventType: 'anti_theft_command_issued',
        eventData: {
          deviceId: device.id,
          commandType: validated.commandType,
          success: true,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        commandId: command.id,
        status: 'sent',
      },
    });
  } catch (error) {
    console.error('[DEVICE_COMMAND_ERROR]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to send command' },
      { status: 500 }
    );
  }
}