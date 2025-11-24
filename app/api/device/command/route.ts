// app/api/device/command/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import admin from 'firebase-admin';
// Add type mapping at the top of the file
const COMMAND_TYPE_MAP = {
  locate: 'LOCATE',
  ring: 'RING',
  lock: 'LOCK',
  wipe: 'WIPE',
} as const;

// Initialize Firebase Admin
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing required Firebase environment variables');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}


const DeviceCommandSchema = z.object({
  deviceId: z.string(),
  commandType: z.enum(['locate', 'ring', 'lock', 'wipe']),
  metadata: z.object({
    lockMessage: z.string().optional(),
    phoneNumber: z.string().optional(),
  }).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request);
    
    // Rate limit: 10 commands per hour per user (prevent abuse)
    const { success } = await rateLimit(`device_command:${user.userId}`, 10, 3600);
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Too many commands. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validated = DeviceCommandSchema.parse(body);

    // Verify device ownership
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

    // Create command record
    const command = await prisma.antiTheftCommand.create({
      data: {
        deviceId: device.id,
        commandType: COMMAND_TYPE_MAP[validated.commandType],
        status: 'PENDING',
        issuedBy: user.userId,
        metadata: validated.metadata || {},
      },
    });

    // Send push notification to device
    const pushResults = await Promise.allSettled(
      device.pushTokens.map(async (pushToken: { id: string; token: string; platform: string }) => {
        const message = {
          token: pushToken.token,
          data: {
            type: 'anti_theft_command',
            commandId: command.id,
            commandType: validated.commandType,
            metadata: JSON.stringify(validated.metadata || {}),
          },
          ...(pushToken.platform === 'apns' ? {
            apns: {
              payload: {
                aps: {
                  contentAvailable: true,
                  sound: validated.commandType === 'ring' ? 'default' : undefined,
                },
              },
            },
          } : {
            android: {
              priority: 'high' as const,
            },
          }),
        };

        try {
      return await admin.messaging().send(message);
    } catch (error: any) {
      // Deactivate invalid tokens
      if (error?.code === 'messaging/invalid-registration-token' || 
          error?.code === 'messaging/registration-token-not-registered') {
        await prisma.pushToken.update({
          where: { id: pushToken.id },
          data: { isActive: false },
        });
      }
      throw error;
    }
      })
    );

    const successfulPushes = pushResults.filter(r => r.status === 'fulfilled').length;

    if (successfulPushes > 0) {
      await prisma.antiTheftCommand.update({
        where: { id: command.id },
        data: { status: 'SENT' },
      });
    }
    else {
    await prisma.antiTheftCommand.update({
      where: { id: command.id },
      data: { status: 'FAILED' },
    });
   }

    // Log telemetry
    await prisma.telemetryLog.create({
      data: {
        userId: user.userId,
        eventType: 'anti_theft_command_issued',
        eventData: {
          commandType: validated.commandType,
          deviceId: device.id,
          success: successfulPushes > 0,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        commandId: command.id,
        status: successfulPushes > 0 ? 'sent' : 'failed',
        pushesSent: successfulPushes,
      },
    });
  } catch (error) {
     console.error('[DEVICE_COMMAND_ERROR]', error instanceof Error ? error.message : 'Unknown error');
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    
    // Handle authentication errors
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to send command' },
      { status: 500 }
    );
  }
}