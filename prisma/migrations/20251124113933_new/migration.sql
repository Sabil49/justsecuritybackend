-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SUPPORT', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "ThreatType" AS ENUM ('hash', 'package', 'url', 'behavior');

-- CreateEnum
CREATE TYPE "ThreatSeverity" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "ThreatCategory" AS ENUM ('malware', 'spyware', 'adware', 'trojan', 'phishing');

-- CreateEnum
CREATE TYPE "QuarantineStatus" AS ENUM ('quarantined', 'restored', 'deleted');

-- CreateEnum
CREATE TYPE "AntiTheftCommandType" AS ENUM ('locate', 'ring', 'lock', 'wipe');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('pending', 'sent', 'executed', 'failed');

-- CreateEnum
CREATE TYPE "AdminAction" AS ENUM ('threat_upload', 'user_ban', 'signature_update');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "authProvider" TEXT NOT NULL,
    "authProviderId" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "passwordHash" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "osVersion" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreatSignature" (
    "id" TEXT NOT NULL,
    "type" "ThreatType" NOT NULL,
    "signature" TEXT NOT NULL,
    "threatName" TEXT NOT NULL,
    "severity" "ThreatSeverity" NOT NULL,
    "category" "ThreatCategory" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreatSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanLog" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "scanType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "filesScanned" INTEGER NOT NULL DEFAULT 0,
    "threatsFound" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "ScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quarantine" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileHash" TEXT NOT NULL,
    "severity" "ThreatSeverity" NOT NULL DEFAULT 'medium',
    "status" "QuarantineStatus" NOT NULL DEFAULT 'quarantined',
    "storageKey" TEXT,
    "storageUrl" TEXT,
    "uploadStatus" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "threatSignatureId" TEXT NOT NULL,

    CONSTRAINT "Quarantine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntiTheftCommand" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "commandType" "AntiTheftCommandType" NOT NULL,
    "status" "CommandStatus" NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "AntiTheftCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformSubId" TEXT,
    "receiptData" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" "AdminAction" NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_authProviderId_idx" ON "User"("authProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceId_key" ON "Device"("deviceId");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "Device_deviceId_idx" ON "Device"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_deviceId_idx" ON "PushToken"("deviceId");

-- CreateIndex
CREATE INDEX "PushToken_token_idx" ON "PushToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ThreatSignature_signature_key" ON "ThreatSignature"("signature");

-- CreateIndex
CREATE INDEX "ThreatSignature_signature_idx" ON "ThreatSignature"("signature");

-- CreateIndex
CREATE INDEX "ThreatSignature_type_isActive_idx" ON "ThreatSignature"("type", "isActive");

-- CreateIndex
CREATE INDEX "ThreatSignature_severity_idx" ON "ThreatSignature"("severity");

-- CreateIndex
CREATE INDEX "ScanLog_deviceId_idx" ON "ScanLog"("deviceId");

-- CreateIndex
CREATE INDEX "ScanLog_status_idx" ON "ScanLog"("status");

-- CreateIndex
CREATE INDEX "ScanLog_startedAt_idx" ON "ScanLog"("startedAt");

-- CreateIndex
CREATE INDEX "Quarantine_deviceId_idx" ON "Quarantine"("deviceId");

-- CreateIndex
CREATE INDEX "Quarantine_status_idx" ON "Quarantine"("status");

-- CreateIndex
CREATE INDEX "Quarantine_fileHash_idx" ON "Quarantine"("fileHash");

-- CreateIndex
CREATE INDEX "Quarantine_threatSignatureId_idx" ON "Quarantine"("threatSignatureId");

-- CreateIndex
CREATE INDEX "AntiTheftCommand_deviceId_idx" ON "AntiTheftCommand"("deviceId");

-- CreateIndex
CREATE INDEX "AntiTheftCommand_status_idx" ON "AntiTheftCommand"("status");

-- CreateIndex
CREATE INDEX "AntiTheftCommand_commandType_idx" ON "AntiTheftCommand"("commandType");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_platformSubId_key" ON "Subscription"("platformSubId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_platformSubId_idx" ON "Subscription"("platformSubId");

-- CreateIndex
CREATE INDEX "TelemetryLog_userId_idx" ON "TelemetryLog"("userId");

-- CreateIndex
CREATE INDEX "TelemetryLog_eventType_idx" ON "TelemetryLog"("eventType");

-- CreateIndex
CREATE INDEX "TelemetryLog_timestamp_idx" ON "TelemetryLog"("timestamp");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_idx" ON "AdminAuditLog"("adminId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE INDEX "AdminAuditLog_timestamp_idx" ON "AdminAuditLog"("timestamp");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quarantine" ADD CONSTRAINT "Quarantine_threatSignatureId_fkey" FOREIGN KEY ("threatSignatureId") REFERENCES "ThreatSignature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quarantine" ADD CONSTRAINT "Quarantine_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntiTheftCommand" ADD CONSTRAINT "AntiTheftCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryLog" ADD CONSTRAINT "TelemetryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
