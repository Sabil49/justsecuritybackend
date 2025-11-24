// app/api/device/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';


const RegisterDeviceSchema = z.object({
  deviceId: z.string().min(1),
  deviceName: z.string().min(1),
  platform: z.enum(['ios', 'android']),
  osVersion: z.string(),
  appVersion: z.string(),
  pushToken: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request);
    
    // Rate limit: 10 requests per minute per user
    const { success } = await rateLimit(`device_register:${user.userId}`, 10, 60);
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validated = RegisterDeviceSchema.parse(body);

    const device = await prisma.device.upsert({
      where: { deviceId: validated.deviceId },
      update: {
        deviceName: validated.deviceName,
        osVersion: validated.osVersion,
        appVersion: validated.appVersion,
        lastSeen: new Date(),
        isActive: true,
      },
      create: {
        userId: user.userId,
        deviceId: validated.deviceId,
        deviceName: validated.deviceName,
        platform: validated.platform as 'IOS' | 'ANDROID',
        osVersion: validated.osVersion,
        appVersion: validated.appVersion,
        lastSeen: new Date(),
        isActive: true,
      },
    });

    // Verify device ownership
    if (device.userId !== user.userId) {
      throw new Error('Device belongs to another user');
    }

  // Register push token if provided
  const pushToken = validated.pushToken;
  if (pushToken) {
    await prisma.$transaction(async (tx) => {
      const existingToken = await tx.pushToken.findUnique({
        where: { token: pushToken },
        include: { device: true }
      });
      
      if (existingToken && existingToken.device && existingToken.device.userId !== user.userId) {
        throw new Error('Push token belongs to another user');
      }
  
      await tx.pushToken.upsert({
        where: { token: pushToken },
        update: {
          deviceId: device.id,
          platform: validated.platform === 'ios' ? 'apns' : 'fcm',
          isActive: true,
        },
        create: {
          deviceId: device.id,
          token: pushToken,
          platform: validated.platform === 'ios' ? 'apns' : 'fcm',
          isActive: true,
        },
      });
    });
  }
    return NextResponse.json({
      success: true,
      data: { deviceId: device.id },
    });
  } catch (error) {
    console.error('[DEVICE_REGISTER_ERROR]', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    
    if (error instanceof Error && 
        (error.message === 'Push token belongs to another user' || 
         error.message === 'Device belongs to another user')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Device registration failed' },
      { status: 500 }
    );
  }
}
   