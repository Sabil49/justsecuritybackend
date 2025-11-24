// app/api/device/location/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';


type AntiTheftCommandMetadata = {
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: string;
  };
  // other metadata fields...
};
const LocationSchema = z.object({
  deviceId: z.string(),
  commandId: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive(),
  timestamp: z.string().datetime(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request);
    
    const body = await request.json();
    const validated = LocationSchema.parse(body);

    // Verify device ownership
    const device = await prisma.device.findFirst({
      where: {
        id: validated.deviceId,
        userId: user.userId,
      },
    });

    if (!device) {
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 }
      );
    }

    // Update command status
    const command = await prisma.antiTheftCommand.findFirst({
      where: {
        id: validated.commandId,
        deviceId: device.id,
        commandType: 'LOCATE',
      },
    });

    if (!command) {
      return NextResponse.json(
        { success: false, error: 'Command not found' },
        { status: 404 }
      );
    }

    await prisma.antiTheftCommand.update({
      where: { id: command.id },
      data: {
        status: 'EXECUTED',
        executedAt: new Date(),
        metadata: {
          ...((command.metadata as AntiTheftCommandMetadata) || {}),
          location: {
            latitude: validated.latitude,
            longitude: validated.longitude,
            accuracy: validated.accuracy,
            timestamp: validated.timestamp,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        commandId: command.id,
        status: 'EXECUTED',
      },
    });
  } catch (error) {
    console.error('[LOCATION_UPDATE_ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      type: error?.constructor?.name,
      // Avoid logging request body or error details that may contain PII
    });
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Location update failed' },
      { status: 500 }
    );
  }
}