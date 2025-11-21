// app/api/admin/threats/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
const ThreatUploadSchema = z.object({
  threats: z.array(z.object({
    type: z.enum(['hash', 'package', 'url', 'behavior']),
    signature: z.string().min(1),
    threatName: z.string().min(1),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    category: z.enum(['malware', 'spyware', 'adware', 'trojan', 'phishing']),
    description: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  })).min(1).max(1000),
  version: z.number().int().positive(),
});

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
    const results = await Promise.allSettled(
      validated.threats.map(threat =>
        prisma.threatSignature.upsert({
          where: { signature: threat.signature },
          update: {
            threatName: threat.threatName,
            severity: threat.severity,
            category: threat.category,
            description: threat.description,
            metadata: threat.metadata,
            version: validated.version,
            isActive: true,
            updatedAt: new Date(),
            type: threat.type,
          },
          create: {
            type: threat.type,
            signature: threat.signature,
            threatName: threat.threatName,
            severity: threat.severity,
            category: threat.category,
            description: threat.description,
            metadata: threat.metadata,
            version: validated.version,
            isActive: true,
          },
        })
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Log admin action
    await prisma.adminAuditLog.create({
      data: {
        adminId: user.userId,
        action: 'threat_upload',
        metadata: {
          version: validated.version,
          checksum,
          totalThreats: validated.threats.length,
          successful,
          failed,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      },
    });

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
    console.error('[THREAT_UPLOAD_ERROR]', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
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
  // Implement your admin check logic
  // This could check a separate Admin table, user role, etc.
   const adminEmailsRaw = process.env.ADMIN_EMAILS || '';
  if (!adminEmailsRaw.trim()) {
    return false;
  }
  
  const adminEmails = adminEmailsRaw
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);
  
  if (adminEmails.length === 0) {
    return false;
  }
   
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  return user ? adminEmails.includes(user.email.toLowerCase()) : false;
}