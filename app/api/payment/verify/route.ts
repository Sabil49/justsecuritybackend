import { google } from 'googleapis';

// app/api/payment/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';

const PaymentVerifySchema = z.object({
  platform: z.enum(['ios', 'android']),
  receiptData: z.string(),
  productId: z.string(),
});

interface VerificationResult {
  valid: boolean;
  subscriptionId: string;
  expiryDate?: number;
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = PaymentVerifySchema.parse(body);

    let verificationResult: VerificationResult;

    if (validated.platform === 'ios') {
      verificationResult = await verifyAppleReceipt(validated.receiptData);
    } else {
      verificationResult = await verifyGoogleReceipt(validated.receiptData);
    }

    if (!verificationResult.valid) {
      return NextResponse.json(
        { success: false, error: 'Invalid receipt' },
        { status: 400 }
      );
    }

    // Calculate subscription period
    const now = new Date();
    const periodEnd = verificationResult.expiryDate
      ? new Date(verificationResult.expiryDate)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days default

    // Update or create subscription
    const subscription = await prisma.subscription.upsert({
      where: {
        platformSubId: verificationResult.subscriptionId,
      },
      update: {
        status: 'active',
        tier: 'premium',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        receiptData: validated.receiptData,
        updatedAt: now,
      },
      create: {
        userId: user.userId,
        tier: 'premium',
        status: 'active',
        platform: validated.platform,
        platformSubId: verificationResult.subscriptionId,
        receiptData: validated.receiptData,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    // Log telemetry
    await prisma.telemetryLog.create({
      data: {
        userId: user.userId,
        eventType: 'subscription_activated',
        eventData: {
          tier: 'premium',
          platform: validated.platform,
          productId: validated.productId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          tier: subscription.tier,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
      },
    });
  } catch (error) {
    console.error('[PAYMENT_VERIFY_ERROR]', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Payment verification failed' },
      { status: 500 }
    );
  }
}

async function verifyAppleReceipt(receiptData: string): Promise<VerificationResult> {
  const verifyUrl = process.env.NODE_ENV === 'production'
    ? 'https://buy.itunes.apple.com/verifyReceipt'
    : 'https://sandbox.itunes.apple.com/verifyReceipt';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
  
  try {
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receiptData,
        password: process.env.APPLE_SHARED_SECRET,
      }),
      signal: controller.signal,
    });

    const data = await response.json();

    // Handle sandbox/production mismatch
    if (data.status === 21007) {
      // Receipt is from sandbox but sent to production
      const sandboxUrl = 'https://sandbox.itunes.apple.com/verifyReceipt';
      
            const sandboxController = new AbortController();
      const sandboxTimeoutId = setTimeout(() => sandboxController.abort(), 10000);
      
      try {
      
      const sandboxResponse = await fetch(sandboxUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            'receipt-data': receiptData,
            password: process.env.APPLE_SHARED_SECRET,
          }),
          signal: sandboxController.signal,
        });
        const sandboxData = await sandboxResponse.json();
        
        return {
          valid: sandboxData.status === 0,
          subscriptionId: sandboxData.receipt?.original_transaction_id || '',
          expiryDate: sandboxData.latest_receipt_info?.[0]?.expires_date_ms 
            ? parseInt(sandboxData.latest_receipt_info[0].expires_date_ms, 10) 
            : undefined,
        };
      } finally {
        clearTimeout(sandboxTimeoutId);
      }
    }

    return {
      valid: data.status === 0,
      subscriptionId: data.receipt?.original_transaction_id || '',
      expiryDate: data.latest_receipt_info?.[0]?.expires_date_ms 
        ? parseInt(data.latest_receipt_info[0].expires_date_ms, 10) || undefined 
        : undefined,
    };
  } catch (error) {
    console.error('[APPLE_VERIFY_ERROR]', error);
    return { valid: false, subscriptionId: '' };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function verifyGoogleReceipt(receiptData: string): Promise<VerificationResult> {
  try {
    
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccountEmail || !serviceAccountKey) {
      throw new Error('Missing Google service account credentials');
    }
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: serviceAccountEmail,
        private_key: serviceAccountKey?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const androidPublisher = google.androidpublisher({
      version: 'v3',
      auth,
    });

    const receipt = JSON.parse(receiptData);
    
    const result = await androidPublisher.purchases.subscriptions.get({
      packageName: process.env.ANDROID_PACKAGE_NAME,
      subscriptionId: receipt.productId,
      token: receipt.purchaseToken,
    });

    const now = Date.now();
    const expiryTime = parseInt(result.data.expiryTimeMillis || '0');
    const isExpired = expiryTime < now;
    const isCancelled = result.data.cancelReason !== undefined;
    const isPaid = result.data.paymentState === 1;

    return {
      valid: isPaid && !isExpired && !isCancelled,
      subscriptionId: receipt.purchaseToken,
      expiryDate: expiryTime,
    };
  } catch (error) {
    console.error('[GOOGLE_VERIFY_ERROR]', error);
    return { valid: false, subscriptionId: '' };
  }
}