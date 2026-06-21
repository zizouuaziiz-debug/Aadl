import { NextRequest, NextResponse } from 'next/server';
import { getUserByChatId } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

const RAILWAY_API_URL = process.env.RAILWAY_API_URL;
const RAILWAY_API_SECRET = process.env.RAILWAY_API_SECRET;

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

    // ✅ التعديل هنا: أضفنا /run إلى الرابط
    const response = await fetch(`${RAILWAY_API_URL}/run`, {
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

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('/api/run-check error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
