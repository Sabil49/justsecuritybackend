// app/api/auth/email-register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { sign } from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET!;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const SALT_ROUNDS = 10;

const EmailRegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  deviceInfo: z.object({
    deviceId: z.string(),
    deviceName: z.string(),
    platform: z.enum(['ios', 'android']),
    osVersion: z.string(),
    appVersion: z.string(),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = EmailRegisterSchema.parse(body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email already registered',
        },
        { status: 409 }
      );
    }

    
    // Create user, device, and subscription in a transaction
    const { user, device, subscription } = await prisma.$transaction(async (tx) => {
      // Hash password
     const passwordHash = await bcrypt.hash(validated.password, SALT_ROUNDS);

      const user = await tx.user.create({
        data: {
          id: randomUUID(),
          email: validated.email,
          name: validated.name,
          authProvider: 'email',
          passwordHash: passwordHash,
        },
      });
      const device = await tx.device.create({
        data: {
          userId: user.id,
          deviceId: validated.deviceInfo.deviceId,
          deviceName: validated.deviceInfo.deviceName,
          platform: validated.deviceInfo.platform as 'IOS' | 'ANDROID',
          osVersion: validated.deviceInfo.osVersion,
          appVersion: validated.deviceInfo.appVersion,
        },
      });

      const subscription = await tx.subscription.create({
        data: {
          userId: user.id,
          tier: 'free',
          status: 'trial',
          platform: validated.deviceInfo.platform,
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return { user, device, subscription };
    });

    // Create JWT token
    const token = sign(
      {
        userId: user.id,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Log telemetry
    try {
      await prisma.telemetryLog.create({
        data: {
          userId: user.id,
          eventType: 'email_register',
          eventData: {
            deviceId: device.id,
            platform: validated.deviceInfo.platform,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (telemetryError) {
      console.error('[TELEMETRY_ERROR]', telemetryError);
      // Continue with registration even if telemetry fails
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
          device: {
            id: device.id,
          },
          subscription: {
            tier: subscription.tier,
            status: subscription.status,
            trialEndsAt: subscription.trialEndsAt,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[EMAIL_REGISTER_ERROR]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Registration failed',
      },
      { status: 500 }
    );
  }
}