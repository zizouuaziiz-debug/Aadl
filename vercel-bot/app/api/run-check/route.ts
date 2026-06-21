import { NextRequest, NextResponse } from 'next/server';
import { getUserByChatId } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

const RAILWAY_API_URL = process.env.RAILWAY_API_URL;
const RAILWAY_API_SECRET = process.env.RAILWAY_API_SECRET;

/**
 * Proxy endpoint that triggers the Railway automation service.
 * نقطة نهاية وسيطة لتشغيل خدمة الأتمتة على Railway.
 *
 * The automation service now returns:
 * - captcha_code: the OCR-extracted CAPTCHA value
 * - captcha_confidence: OCR confidence score
 * - verification_status: 'success' | 'failure' | 'unknown'
 * - image_url / image_base64: result screenshot
 * - ocr_attempts: details of each OCR retry
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown';
    if (!rateLimit(`run-check:${ip}`, 5, 60_000)) {
      return NextResponse.json(
        { status: 'error', message: 'Too many requests' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { chat_id } = body || {};

    if (!chat_id) {
      return NextResponse.json(
        { status: 'error', message: 'Missing chat_id' },
        { status: 400 }
      );
    }

    const user = await getUserByChatId(String(chat_id));
    if (!user || !user.code || !user.password) {
      return NextResponse.json(
        { status: 'error', message: 'User credentials not found' },
        { status: 404 }
      );
    }

    if (!RAILWAY_API_URL) {
      return NextResponse.json(
        { status: 'error', message: 'Automation service not configured' },
        { status: 503 }
      );
    }

    const response = await fetch(RAILWAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Railway-Secret': RAILWAY_API_SECRET || '',
      },
      body: JSON.stringify({
        chat_id: String(chat_id),
        code: user.code,
        password: user.password,
      }),
    });

    const data = await response.json().catch(() => ({
      status: 'error',
      message: 'Invalid response from automation service',
    }));

    // Pass through the full automation response including CAPTCHA details
    // تمرير الرد الكامل من خدمة الأتمتة بما في ذلك تفاصيل CAPTCHA
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('/api/run-check error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
