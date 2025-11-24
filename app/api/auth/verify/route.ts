// app/api/auth/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { email, z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuthToken } from '@/lib/auth';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { randomUUID } from 'crypto';

interface VerifiedIdentity {
  email: string | null;
  providerId: string;
  name?: string | null;
}
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

    // Verify ID token using real provider verification (Google / Apple)
const verified = await verifyProviderToken(
  validated.idToken,
  validated.provider as 'google' | 'apple'
);

// Extract verified identity
const { email, providerId, name } = verified;

// If for any reason verification returned invalid data
if (!email || !providerId) {
  throw new Error('Failed to verify identity token');
}

    // Upsert user
    const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.upsert({
    where: { email },
     update: { 
       updatedAt: new Date(),
     },
     create: {
       id: randomUUID(),
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
  const existingDevice = await tx.device.findUnique({
    where: { deviceId: validated.deviceInfo.deviceId },
  });

  if (existingDevice && existingDevice.userId !== user.id) {
    throw new Error('Device belongs to another user');
  }

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
      platform: validated.deviceInfo.platform as 'IOS' | 'ANDROID',
      osVersion: validated.deviceInfo.osVersion,
      appVersion: validated.deviceInfo.appVersion,
    },
  });

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
    console.error('[AUTH_VERIFY_ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : typeof error,
    });
    
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



const googleClient = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID);

// Apple JWKS client
const appleKeys = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
});

// Helper: get Apple signing key
function getAppleSigningKey(header: any, callback: any) {
  appleKeys.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}
async function verifyGoogleToken(idToken: string): Promise<VerifiedIdentity> {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload?.email) {
    throw new Error('Google token verification failed');
  }

  return {
    email: payload.email,
    providerId: payload.sub,
    name: payload.name ?? null,
  };
}

async function verifyAppleToken(idToken: string): Promise<VerifiedIdentity> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getAppleSigningKey,
      {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
      },
      (err, decoded: any) => {
        if (err) return reject(new Error('Invalid Apple ID token'));

        resolve({
          email: decoded.email ?? null,
          providerId: decoded.sub,
          name: decoded.name ?? null,
        });
      }
    );
  });
}


export async function verifyProviderToken(
  token: string,
  provider: 'google' | 'apple'
): Promise<VerifiedIdentity> {
  if (provider === 'google') return await verifyGoogleToken(token);
  if (provider === 'apple') return await verifyAppleToken(token);

  throw new Error('Unsupported provider');
}
