// prisma/seed.ts
import { prisma } from "@/lib/prisma";

async function main() {
  console.log('Seeding database...');

  // Create test user
  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      name: 'Test User',
      authProvider: 'google',
    },
  });

  console.log(`Created user: ${user.email}`);

  // Create test device
  const device = await prisma.device.create({
    data: {
      userId: user.id,
      deviceId: 'test-device-001',
      deviceName: 'Test Device',
      platform: 'android',
      osVersion: '14.0',
      appVersion: '1.0.0',
    },
  });

  console.log(`Created device: ${device.deviceName}`);

  // Create sample threat signatures
  const threats = await prisma.threatSignature.createMany({
    data: [
      {
        type: 'hash',
        signature: 'a'.repeat(64), // Example SHA-256-like hex string
        threatName: 'Trojan.Android.Generic',
        severity: 'critical',
        category: 'trojan',
      },
      {
        type: 'package',
        signature: 'com.malicious.app',
        threatName: 'PUA.Android.Adware',
        severity: 'medium',
        category: 'adware',
      },
    ],
  });

  console.log(`Created ${threats.count} threat signatures`);

  // Create test subscription
  const subscription = await prisma.subscription.create({
    data: {
      userId: user.id,
      tier: 'free',
      status: 'trial',
      platform: 'android',
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`Created subscription: ${subscription.tier}`);

  console.log('Seeding completed!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });