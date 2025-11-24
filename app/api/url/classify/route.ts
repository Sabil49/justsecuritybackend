// app/api/url/classify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth';

const ClassifyUrlSchema = z.object({
  url: z.string().url(),
});

export async function POST(request: NextRequest) {
  try {
    await verifyAuth(request);

    const body = await request.json();
    const validated = ClassifyUrlSchema.parse(body);

    // Call Google Safe Browsing API or similar
    const classification = await classifyUrlWithThreatIntel(validated.url);

    return NextResponse.json({
      success: true,
      data: classification,
    });
  } catch (error) {
    console.error('[URL_CLASSIFY_ERROR]', error instanceof Error ? error.message : 'Unknown error');

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }
}

async function classifyUrlWithThreatIntel(url: string) {
  // Implement with Google Safe Browsing API
  // https://developers.google.com/safe-browsing/v4
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_SAFE_BROWSING_KEY is not configured');
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          client: {
            clientId: 'antivirus-app',
            clientVersion: '1.0.0',
          },
          threatInfo: {
            threatTypes: [
              'MALWARE',
              'SOCIAL_ENGINEERING',
              'UNWANTED_SOFTWARE',
              'POTENTIALLY_HARMFUL_APPLICATION',
            ],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }],
          },
        }),
      }
    );
    clearTimeout(timeoutId);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Safe Browsing API error: ${response.status}`);
    }

    if (data.matches && data.matches.length > 0) {
      return {
        isSafe: false,
        category: data.matches[0].threatType,
        reason: `This URL is flagged as ${data.matches[0].threatType}`,
      };
    }

    return { isSafe: true };
  } catch (error) {
    console.error('[THREAT_INTEL_ERROR]', error instanceof Error ? error.message : 'Unknown error');
    return { isSafe: true }; // Fail open
  }
}