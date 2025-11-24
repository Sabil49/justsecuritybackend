

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { InputJsonValue } from '@prisma/client/runtime/library';
import type { AntiTheftCommandType } from '@prisma/client';

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
    // Send push notification to device
    for (const token of device.pushTokens) {
     await sendPushNotification(token.token, {
     commandId: command.id,
      commandType: validated.commandType,
     metadata: validated.metadata,
    });
    }
    // Normalize metadata (safe for Prisma JSON)
    const metadata: Record<string, unknown> = validated.metadata ?? {};
    
    const command = await prisma.antiTheftCommand.create({
      data: {
        deviceId: device.id,
        commandType: (validated.commandType.toUpperCase() as unknown) as AntiTheftCommandType,
        status: 'SENT',
        issuedBy: user.userId,
        metadata: metadata as InputJsonValue,
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
async function sendPushNotification(
  token: string,
  arg1: {
    commandId: string;
    commandType: "locate" | "ring" | "lock" | "wipe";
    metadata?: { lockMessage?: string; phoneNumber?: string };
  }
): Promise<void> {
  const { commandId, commandType, metadata } = arg1;

  // Friendly titles for notifications
  const titles: Record<typeof commandType, string> = {
    locate: 'Locate request',
    ring: 'Ring request',
    lock: 'Lock request',
    wipe: 'Wipe request',
  } as any;

  const title = titles[commandType] ?? 'Device command';
  const bodyParts: string[] = [];
  if (metadata?.lockMessage) bodyParts.push(metadata.lockMessage);
  if (metadata?.phoneNumber) bodyParts.push(`Phone: ${metadata.phoneNumber}`);
  const body = bodyParts.length ? bodyParts.join(' — ') : `${commandType} command issued`;

  const payload = {
    to: token,
    // data is what the client app can use to correlate the command
    data: {
      commandId,
      commandType,
      metadata: metadata ?? {},
    },
    // notification is optional and used by push providers to display user-visible UI
    notification: {
      title,
      body,
    },
  };

  // Use a configurable push service endpoint (e.g. internal proxy, FCM HTTP v1 wrapper, etc.)
  const endpoint = process.env.PUSH_SERVICE_URL;
  const apiKey = process.env.PUSH_SERVICE_KEY;

  if (!endpoint) {
    // No configured push service: log and return (don't throw so user request can continue)
    console.warn('[PUSH] PUSH_SERVICE_URL not configured; skipping push send', {
      token,
      commandId,
      commandType,
    });
    return;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '<failed to read body>');
      console.error('[PUSH] Failed to send push', {
        status: res.status,
        statusText: res.statusText,
        body: text,
        token,
        commandId,
      });
    }
  } catch (err) {
    console.error('[PUSH] Error sending push notification', { err, token, commandId });
  }
}
