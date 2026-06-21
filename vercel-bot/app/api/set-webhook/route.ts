import { NextRequest, NextResponse } from 'next/server';
import { setWebhook } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const token = process.env.BOT_TOKEN;

    if (!vercelUrl) {
      return NextResponse.json(
        { status: 'error', message: 'VERCEL_URL or NEXT_PUBLIC_VERCEL_URL not set' },
        { status: 400 }
      );
    }
    if (!secret) {
      return NextResponse.json(
        { status: 'error', message: 'TELEGRAM_WEBHOOK_SECRET not set' },
        { status: 400 }
      );
    }
    if (!token) {
      return NextResponse.json(
        { status: 'error', message: 'BOT_TOKEN not set' },
        { status: 400 }
      );
    }

    const webhookUrl = `${vercelUrl}/api/webhook`;
    const result = await setWebhook(webhookUrl, secret);

    return NextResponse.json({ status: 'ok', webhook_url: webhookUrl, result });
  } catch (error) {
    console.error('Set webhook error:', error);
    return NextResponse.json(
      { status: 'error', message: (error as Error).message },
      { status: 500 }
    );
  }
}
