// prisma/seed.ts
import {
  PrismaClient,
  UserRole,
  Platform,
  ThreatSeverity,
  ThreatType,
  ThreatCategory,
  QuarantineStatus,
  AntiTheftCommandType,
  CommandStatus,
  AdminAction,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  /**
   * ===========================
   * 1. CREATE ADMIN USER
   * ===========================
   */
  const admin = await prisma.user.create({
    data: {
      id: "admin-001",
      email: "admin@example.com",
      name: "System Admin",
      authProvider: "google",
      authProviderId: "google-admin-id",
      role: UserRole.SUPERADMIN,
    },
  });
  console.log(`✔ Admin user created: ${admin.email}`);

  /**
   * ===========================
   * 2. CREATE REGULAR TEST USER
   * ===========================
   */
  const user = await prisma.user.create({
    data: {
      id: "user-001",
      email: "user@example.com",
      name: "Test User",
      authProvider: "google",
      authProviderId: "google-user-id",
      role: UserRole.USER,
    },
  });
  console.log(`✔ Test user created: ${user.email}`);

  /**
   * ===========================
   * 3. CREATE DEVICE
   * ===========================
   */
  const device = await prisma.device.create({
    data: {
      userId: user.id,
      deviceId: "device-001",
      deviceName: "Pixel 8 Pro",
      platform: Platform.ANDROID,
      osVersion: "14.0",
      appVersion: "1.0.0",
    },
  });
  console.log(`✔ Device created: ${device.deviceName}`);

  /**
   * ===========================
   * 4. CREATE PUSH TOKEN
   * ===========================
   */
  await prisma.pushToken.create({
    data: {
      deviceId: device.id,
      token: "push-token-xyz",
      platform: "android",
    },
  });
  console.log("✔ Push token created");

  /**
   * ===========================
   * 5. CREATE THREAT SIGNATURES
   * ===========================
   */
  const threatSignature1 = await prisma.threatSignature.create({
    data: {
      type: ThreatType.HASH,
      signature: "a".repeat(64),
      threatName: "Trojan.Android.Generic",
      severity: ThreatSeverity.CRITICAL,
      category: ThreatCategory.TROJAN,
      description: "Highly dangerous malware targeting Android users.",
    },
  });

  const threatSignature2 = await prisma.threatSignature.create({
    data: {
      type: ThreatType.PACKAGE,
      signature: "com.fake.app",
      threatName: "Android.Adware.Popup",
      severity: ThreatSeverity.MEDIUM,
      category: ThreatCategory.ADWARE,
      description: "Annoying popup adware application.",
    },
  });

  console.log("✔ Threat signatures created");

  /**
   * ===========================
   * 6. CREATE SCAN LOG
   * ===========================
   */
  const scanLog = await prisma.scanLog.create({
    data: {
      deviceId: device.id,
      scanType: "full",
      status: "completed",
      filesScanned: 1520,
      threatsFound: 1,
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 3000,
      metadata: {
        details: "Full device scan completed",
      },
    },
  });

  console.log("✔ ScanLog created");

  /**
   * ===========================
   * 7. CREATE QUARANTINE ITEM
   * ===========================
   */
  await prisma.quarantine.create({
    data: {
      deviceId: device.id,
      fileName: "malware.apk",
      filePath: "/storage/emulated/0/Download/malware.apk",
      fileSize: 2048,
      fileHash: "deadbeefdeadbeefdeadbeefdeadbeef",
      severity: ThreatSeverity.HIGH,
      status: QuarantineStatus.QUARANTINED,
      threatSignatureId: threatSignature1.id,
      storageKey: "quarantine/malware.apk",
      storageUrl: "https://storage.example.com/quarantine/malware.apk",
      uploadStatus: "uploaded",
    },
  });

  console.log("✔ Quarantine sample created");

  /**
   * ===========================
   * 8. CREATE ANTI-THEFT COMMAND
   * ===========================
   */
  await prisma.antiTheftCommand.create({
    data: {
      deviceId: device.id,
      commandType: AntiTheftCommandType.LOCATE,
      status: CommandStatus.PENDING,
      issuedBy: admin.id,
      metadata: { reason: "Security test" },
    },
  });

  console.log("✔ Anti-theft command created");

  /**
   * ===========================
   * 9. CREATE SUBSCRIPTION
   * ===========================
   */
  await prisma.subscription.create({
    data: {
      userId: user.id,
      tier: "free",
      status: "active",
      platform: "android",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("✔ Subscription created");

  /**
   * ===========================
   * 10. TELEMETRY LOG
   * ===========================
   */
  await prisma.telemetryLog.create({
    data: {
      userId: user.id,
      eventType: "scan_completed",
      eventData: {
        files: 1520,
        threats: 1,
      },
    },
  });

  console.log("✔ Telemetry log created");

  /**
   * ===========================
   * 11. ADMIN AUDIT LOG
   * ===========================
   */
  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.id,
      action: AdminAction.THREAT_UPLOAD,
      targetId: threatSignature1.id,
      metadata: { note: "Initial malware DB population" },
      ipAddress: "127.0.0.1",
    },
  });

  console.log("✔ Admin audit log created");

  console.log("🎉 Database seeding complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("❌ Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
