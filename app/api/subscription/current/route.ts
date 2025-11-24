// app/api/subscription/current/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const user = await verifyAuth(request);

    // Get user's current active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.userId,
        status: { in: ['active', 'trial'] },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // If no active subscription, create a free tier
    if (!subscription) {
      const newSubscription = await prisma.subscription.create({
        data: {
          userId: user.userId,
          tier: 'free',
          status: 'active',
          platform: 'android', // Default, should be from device
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          subscription: {
            id: newSubscription.id,
            tier: newSubscription.tier,
            status: newSubscription.status,
            platform: newSubscription.platform,
            trialEndsAt: newSubscription.trialEndsAt,
            currentPeriodStart: newSubscription.currentPeriodStart,
            currentPeriodEnd: newSubscription.currentPeriodEnd,
            isPremium: newSubscription.tier === 'premium',
            isTrialActive:
              newSubscription.status === 'trial' &&
              newSubscription.trialEndsAt
                ? new Date(newSubscription.trialEndsAt) > new Date()
                : false,
          },
        },
      });
    }

    // Check if trial is still active
    const isTrialActive =
      subscription.status === 'trial' && subscription.trialEndsAt
        ? new Date(subscription.trialEndsAt) > new Date()
        : false;

    // If trial expired, update status
    if (subscription.status === 'trial' && !isTrialActive) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { 
          status: 'expired',
          tier: 'free'
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          subscription: {
            id: subscription.id,
            tier: 'free',
            status: 'expired',
            platform: subscription.platform,
            trialEndsAt: subscription.trialEndsAt,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            isPremium: false,
            isTrialActive: false,
          },
        },
      });
    }

    // Get trial days remaining (if trial)
    let trialDaysRemaining = null;
    if (subscription.status === 'trial' && subscription.trialEndsAt) {
      const now = new Date();
      const trialEnd = new Date(subscription.trialEndsAt);
      trialDaysRemaining = Math.ceil(
        (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          tier: subscription.tier,
          status: subscription.status,
          platform: subscription.platform,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          isPremium: subscription.tier === 'premium' && subscription.status === 'active',
          isTrialActive,
          trialDaysRemaining,
        },
      },
    });
  } catch (error) {
    console.error('[GET_SUBSCRIPTION_ERROR]', error);

    if (error instanceof Error && error.message.includes('Invalid or expired token')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch subscription',
      },
      { status: 500 }
    );
  }
}

/**
 * Alternative - POST endpoint if you want to check subscription
 * for multiple devices or with more details
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request);
    const body = await request.json();
    const { deviceId } = body;

    // Get subscription for specific device (optional)
    let whereClause: any = { userId: user.userId };

    if (deviceId) {
      const device = await prisma.device.findFirst({
        where: {
          deviceId: deviceId,
          userId: user.userId,
        },
      });
      
      if (!device) {
        return NextResponse.json(
          {
            success: false,
            error: 'Device not found',
          },
          { status: 404 }
        );
      }
      
      // Add device filtering to subscription query
      whereClause.deviceId = device.id; // or however your schema links subscriptions to devices
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        ...whereClause,
        status: { in: ['active', 'trial'] },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!subscription) {
      return NextResponse.json({
        success: true,
        data: {
          subscription: {
            tier: 'free',
            status: 'active',
            isPremium: false,
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          tier: subscription.tier,
          status: subscription.status,
          platform: subscription.platform,
          isPremium: subscription.tier === 'premium' && subscription.status === 'active',
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
      },
    });
  } catch (error) {
    console.error('[POST_SUBSCRIPTION_ERROR]', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch subscription',
      },
      { status: 500 }
    );
  }
}