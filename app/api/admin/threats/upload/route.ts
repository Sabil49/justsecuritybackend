// app/api/admin/threats/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { InputJsonValue } from '@prisma/client/runtime/library';
import { ThreatSeverity, ThreatCategory, ThreatType } from '@prisma/client';
const ThreatUploadSchema = z.object({
  threats: z.array(z.object({
    type: z.enum(['hash', 'package', 'url', 'behavior']),
    signature: z.string().min(1),
    threatName: z.string().min(1),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    category: z.enum(['malware', 'spyware', 'adware', 'trojan', 'phishing']),
    description: z.string().optional(),
    metadata: z.record(z.string(),z.unknown()).optional(),
  })).min(1).max(1000),
  version: z.number().int().positive(),
});
function mapToThreatSeverity(severity: string): ThreatSeverity {
  const upper = severity.toUpperCase();
  if (upper === 'CRITICAL' || upper === 'HIGH' || upper === 'MEDIUM' || upper === 'LOW') {
    return upper as ThreatSeverity;
  }
  throw new Error(`Invalid severity: ${severity}`);
}
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request);
    
    // Check if user is admin (implement your own admin check)
    const isAdmin = await checkAdminStatus(user.userId);
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = ThreatUploadSchema.parse(body);

    // Calculate checksum of upload
    const checksum = createHash('sha256')
      .update(JSON.stringify(validated.threats))
      .digest('hex');
    // Upsert threats
      const results = await prisma.$transaction(async (tx) => {
      const upsertResults = await Promise.allSettled(
        validated.threats.map(threat =>
          tx.threatSignature.upsert({
          where: { signature: threat.signature },
          update: {
            threatName: threat.threatName,
            severity: mapToThreatSeverity(threat.severity),
            category: threat.category.toUpperCase() as unknown as ThreatCategory,
            description: threat.description,
            metadata: threat.metadata as InputJsonValue,
            version: validated.version,
            isActive: true,
            updatedAt: new Date(),
            type: threat.type.toUpperCase() as unknown as ThreatType,
          },
          create: {
            type: threat.type.toUpperCase() as unknown as ThreatType,
            signature: threat.signature,
            threatName: threat.threatName,
            severity: mapToThreatSeverity(threat.severity),
            category: threat.category.toUpperCase() as unknown as ThreatCategory,
            description: threat.description,
            metadata: threat.metadata as InputJsonValue,
            version: validated.version,
            isActive: true,
          },
        })
      )
    );

      const successful = upsertResults.filter(r => r.status === 'fulfilled').length;
      const failed = upsertResults.filter(r => r.status === 'rejected').length;
    // Log admin action
        await tx.adminAuditLog.create({
          data: {
            adminId: user.userId,
            action: 'THREAT_UPLOAD',
            metadata: {
              version: validated.version,
              checksum,
              totalThreats: validated.threats.length,
              successful,
              failed,
            },
            ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0].trim() 
                      || request.headers.get('x-real-ip') 
                      || 'unknown',
          },
        });
         return { successful, failed };
    });

    const { successful, failed } = results;

    return NextResponse.json({
      success: true,
      data: {
        uploaded: successful,
        failed,
        version: validated.version,
        checksum,
      },
    });
  } catch (error) {
        console.error('[THREAT_UPLOAD_ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : typeof error,
    });
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data. Please check the input and try again.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Threat upload failed' },
      { status: 500 }
    );
  }
}

async function checkAdminStatus(userId: string): Promise<boolean> {
  // 1. Load environment-based fallback admins
  const adminEmailsRaw = process.env.ADMIN_EMAILS || '';
  const envAdmins = adminEmailsRaw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);

  // 2. Fetch user and role from DB
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true }, // <-- add "role" field in schema
  });

  if (!user) return false;

  const email = user.email.toLowerCase();

  // 3. Check DB role (scalable, recommended)
  if (user.role === 'admin') {
    return true;
  }

  // 4. Fallback: Environment-admins (for initial setup)
  if (envAdmins.includes(email)) {
    return true;
  }

  return false;
}
