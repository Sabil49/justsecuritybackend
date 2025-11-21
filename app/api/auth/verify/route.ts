// app/api/auth/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuthToken } from '@/lib/auth';



const VerifySchema = z.object({
  idToken: z.string().min(1),
  provider: z.enum(['google', 'apple', 'email']),
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
    const validated = VerifySchema.parse(body);

    // Verify ID token with provider (Google, Apple, etc.)
    // This is a placeholder - implement actual verification
    const { email, providerId, name } = await verifyProviderToken(
      validated.idToken,
      validated.provider
    );

    // Upsert user
    const result = await prisma.$transaction(async (tx: typeof prisma) => {
  // Upsert user
  const existingUser = await tx.user.findUnique({
    where: { email }
  });

  if (existingUser && existingUser.authProviderId !== providerId) {
    throw new Error('Provider ID mismatch');
  }  
  const user = await tx.user.upsert({
    where: { email },
     update: { 
       updatedAt: new Date(),
     },
     create: {
       email,
       name,
       authProvider: validated.provider,
       authProviderId: providerId,
     },
   });

  if (user.authProviderId !== providerId) {
    throw new Error('Provider ID mismatch');
  }

  // Upsert device
  const device = await tx.device.upsert({
    where: { deviceId: validated.deviceInfo.deviceId },
    update: {
      userId: user.id,
      lastSeen: new Date(),
      osVersion: validated.deviceInfo.osVersion,
      appVersion: validated.deviceInfo.appVersion,
    },
    create: {
      userId: user.id,
      deviceId: validated.deviceInfo.deviceId,
      deviceName: validated.deviceInfo.deviceName,
      platform: validated.deviceInfo.platform,
      osVersion: validated.deviceInfo.osVersion,
      appVersion: validated.deviceInfo.appVersion,
    },
  });

  if (device.userId !== user.id) {
    throw new Error('Device belongs to another user');
  }

  // Check/create subscription
  let subscription = await tx.subscription.findFirst({
    where: { userId: user.id, status: { in: ['active', 'trial'] } },
   orderBy: { createdAt: 'desc' },
  });

  if (!subscription) {
    subscription = await tx.subscription.create({
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

  return { user, device, subscription };
});

    // Create JWT
    const token = createAuthToken(result.user.id, result.user.email);

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        },
        device: {
          id: result.device.id,
        },
        subscription: {
          tier: result.subscription.tier,
          status: result.subscription.status,
          trialEndsAt: result.subscription.trialEndsAt,
        },
      },
    });
  } catch (error) {
    console.error('[AUTH_VERIFY_ERROR]', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 401 }
    );
  }
}

// Placeholder for provider token verification
async function verifyProviderToken(token: string, provider: string) {
  // Implement actual verification with Google/Apple OAuth
  return {
    email: 'user@example.com',
    providerId: 'provider_id_123',
    name: 'User Name',
  };
}