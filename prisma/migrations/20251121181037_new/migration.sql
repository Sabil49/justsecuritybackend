/*
  Warnings:

  - The `severity` column on the `Quarantine` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Quarantine` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `action` on the `AdminAuditLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `commandType` on the `AntiTheftCommand` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `AntiTheftCommand` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `type` on the `ThreatSignature` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `severity` on the `ThreatSignature` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `category` on the `ThreatSignature` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
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

-- AlterTable
ALTER TABLE "AdminAuditLog" DROP COLUMN "action",
ADD COLUMN     "action" "AdminAction" NOT NULL;

-- AlterTable
ALTER TABLE "AntiTheftCommand" DROP COLUMN "commandType",
ADD COLUMN     "commandType" "AntiTheftCommandType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "CommandStatus" NOT NULL;

-- AlterTable
ALTER TABLE "Quarantine" DROP COLUMN "severity",
ADD COLUMN     "severity" "ThreatSeverity" NOT NULL DEFAULT 'medium',
DROP COLUMN "status",
ADD COLUMN     "status" "QuarantineStatus" NOT NULL DEFAULT 'quarantined';

-- AlterTable
ALTER TABLE "ThreatSignature" DROP COLUMN "type",
ADD COLUMN     "type" "ThreatType" NOT NULL,
DROP COLUMN "severity",
ADD COLUMN     "severity" "ThreatSeverity" NOT NULL,
DROP COLUMN "category",
ADD COLUMN     "category" "ThreatCategory" NOT NULL;

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE INDEX "AntiTheftCommand_status_idx" ON "AntiTheftCommand"("status");

-- CreateIndex
CREATE INDEX "AntiTheftCommand_commandType_idx" ON "AntiTheftCommand"("commandType");

-- CreateIndex
CREATE INDEX "Quarantine_status_idx" ON "Quarantine"("status");

-- CreateIndex
CREATE INDEX "ThreatSignature_type_isActive_idx" ON "ThreatSignature"("type", "isActive");

-- CreateIndex
CREATE INDEX "ThreatSignature_severity_idx" ON "ThreatSignature"("severity");
