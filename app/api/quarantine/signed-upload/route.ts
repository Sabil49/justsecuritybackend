// app/api/quarantine/signed-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {prisma} from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';




const SignedUploadSchema = z.object({
  quarantineId: z.string(),
  fileSize: z.number().int().positive(),
  contentType: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    // Validate required environment variables
    if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || 
        !process.env.AWS_SECRET_ACCESS_KEY || !process.env.S3_BUCKET_NAME) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }
    const s3Client = new S3Client({
     region: process.env.AWS_REGION!,
     credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    });
    const user = await verifyAuth(request);
    
    const body = await request.json();
    const validated = SignedUploadSchema.parse(body);

    // Verify quarantine record belongs to user
    const quarantine = await prisma.quarantine.findFirst({
      where: {
        id: validated.quarantineId,
        device: {
          userId: user.userId,
        },
      },
    });

    if (!quarantine) {
      return NextResponse.json(
        { success: false, error: 'Quarantine record not found' },
        { status: 404 }
      );
    }

    // Generate unique storage key
    const storageKey = `quarantine/${user.userId}/${quarantine.deviceId}/${Date.now()}-${quarantine.fileHash}`;

    // Generate signed URL (valid for 15 minutes)
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: storageKey,
      ContentType: validated.contentType,
      ContentLength: validated.fileSize,
      ServerSideEncryption: 'AES256',
      Metadata: {
        userId: user.userId,
        deviceId: quarantine.deviceId,
        fileHash: quarantine.fileHash,
      },
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 900, // 15 minutes
    });

    // Update quarantine record
    await prisma.quarantine.update({
      where: { id: quarantine.id },
      data: {
        storageKey,
        fileSize: validated.fileSize,
        uploadStatus: 'pending', // Track upload state
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl: signedUrl,
        storageKey,
        expiresIn: 900,
      },
    });
  } catch (error) {
    console.error('[SIGNED_UPLOAD_ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      name: error instanceof Error ? error.name : 'Unknown',
      // Exclude stack traces and full error details in production
    });
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}