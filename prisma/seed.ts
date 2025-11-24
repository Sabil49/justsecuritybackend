// prisma/seed.ts
import { PrismaClient, ThreatSeverity, ThreatCategory, ThreatType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create test user
  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      name: 'Test User',
      authProvider: 'google',
      authProviderId: 'test-google-id',
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

  // Create sample threat signatures with ENUMS
  const threats = await prisma.threatSignature.createMany({
    data: [
      {
        type: ThreatType.HASH,
        signature: 'a'.repeat(64),
        threatName: 'Trojan.Android.Generic',
        severity: ThreatSeverity.CRITICAL,
        category: ThreatCategory.TROJAN,
      },
      {
        type: ThreatType.PACKAGE,
        signature: 'com.malicious.app',
        threatName: 'PUA.Android.Adware',
        severity: ThreatSeverity.MEDIUM,
        category: ThreatCategory.ADWARE,
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
