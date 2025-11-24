// app/api/auth/email-login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { sign } from 'jsonwebtoken';
// @ts-ignore - missing type declarations for @upstash/ratelimit in this project
import { Ratelimit } from '@upstash/ratelimit';
// @ts-ignore - missing type declarations for @upstash/redis in this project
import { Redis } from '@upstash/redis';

const JWT_SECRET = process.env.JWT_SECRET!;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not configured');
}

const EmailLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password required'),
  deviceInfo: z.object({
    deviceId: z.string(),
    deviceName: z.string(),
    platform: z.enum(['ios', 'android']),
    osVersion: z.string(),
    appVersion: z.string(),
  }),
});

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '15 m'), // 5 attempts per 15 minutes
});

export async function POST(request: NextRequest) {
  // Rate limit by IP or email
  // Prefer common proxy headers (x-forwarded-for, x-real-ip, x-client-ip); fall back to 'anonymous'
  const forwarded =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-client-ip') ||
    'anonymous';
  const identifier = forwarded.split(',')[0].trim();
  const { success } = await ratelimit.limit(identifier);
  
  if (!success) {
    return NextResponse.json(
      { success: false, error: 'Too many login attempts' },
      { status: 429 }
    );
  }
  try {
    const body = await request.json();
    const validated = EmailLoginSchema.parse(body);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email or password',
        },
        { status: 401 }
      );
    }

    // For email auth, we need to check password (assuming you store hashed password)
    // This assumes you have a password field in User model
    // If not, add it to your Prisma schema
    const passwordHash = user.passwordHash;

    if (!passwordHash) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email or password',
        },
        { status: 401 }
      );
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(validated.password, passwordHash);

    if (!passwordMatch) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email or password',
        },
        { status: 401 }
      );
    }

    // Update user last activity
    await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() },
    });

    // Upsert device
    const device = await prisma.device.upsert({
      where: { deviceId: validated.deviceInfo.deviceId },
      update: {
        lastSeen: new Date(),
        osVersion: validated.deviceInfo.osVersion,
        appVersion: validated.deviceInfo.appVersion,
      },
      create: {
        userId: user.id,
        deviceId: validated.deviceInfo.deviceId,
        deviceName: validated.deviceInfo.deviceName,
        platform: validated.deviceInfo.platform as 'IOS' | 'ANDROID',
        osVersion: validated.deviceInfo.osVersion,
        appVersion: validated.deviceInfo.appVersion,
      },
    });

    // Check subscription
    let subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trial'] },
      },
    });

    if (!subscription) {
      // Create free trial
      subscription = await prisma.subscription.create({
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
    }

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
    await prisma.telemetryLog.create({
      data: {
        userId: user.id,
        eventType: 'email_login',
        eventData: {
          deviceId: device.id,
          platform: validated.deviceInfo.platform,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error('[EMAIL_LOGIN_ERROR]', error);

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
        error: 'Login failed',
      },
      { status: 500 }
    );
  }
}