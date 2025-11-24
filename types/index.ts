// types/index.ts
export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
  role: 'user' | 'admin' | 'support' | 'superadmin';
}

export interface Device {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  platform: 'ios' | 'android';
  osVersion: string;
  appVersion: string;
  isActive: boolean;
  lastSeen: Date;
}

export interface ScanResult {
  id: string;
  deviceId: string;
  scanType: 'quick' | 'full' | 'custom';
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  filesScanned: number;
  threatsFound: number;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
}

export interface ThreatSignature {
  id: string;
  type: 'hash' | 'package' | 'url' | 'behavior';
  signature: string;
  threatName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  isActive: boolean;
  version: number;
}

export interface Quarantine {
  id: string;
  deviceId: string;
  fileName: string;
  filePath: string;
  fileHash: string;
  threatName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'quarantined' | 'restored' | 'deleted';
  createdAt: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  tier: 'free' | 'premium';
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  trialEndsAt?: Date;
  currentPeriodEnd?: Date;
}

export interface AntiTheftCommand {
  id: string;
  deviceId: string;
  commandType: 'locate' | 'ring' | 'lock' | 'wipe';
  status: 'pending' | 'sent' | 'executed' | 'failed';
  issuedAt: Date;
  executedAt?: Date;
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  action: 'threat_upload' | 'user_ban' | 'signature_update';
  targetId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  timestamp: Date;
}
