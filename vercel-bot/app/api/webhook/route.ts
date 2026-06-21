import { NextRequest, NextResponse } from 'next/server';
import { getUserByChatId, upsertUser } from '@/lib/db';
import {
  sendMessage,
  sendPhoto,
  sendPhotoBase64,
  answerCallbackQuery,
  buildRunCheckKeyboard,
} from '@/lib/telegram';
import { rateLimit } from '@/lib/rate-limit';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const RAILWAY_API_URL = process.env.RAILWAY_API_URL;
const RAILWAY_API_SECRET = process.env.RAILWAY_API_SECRET;

function validateSecret(req: NextRequest): boolean {
  if (!WEBHOOK_SECRET) return true; // allow if not configured (dev mode)
  const header = req.headers.get('x-telegram-bot-api-secret-token');
  return header === WEBHOOK_SECRET;
}

export async function POST(req: NextRequest) {
  try {
    // سجل وصول الطلب
    console.log('🔵 Webhook received at', new Date().toISOString());

    if (!validateSecret(req)) {
      console.warn('⚠️ Unauthorized webhook request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    console.log('📦 Webhook body:', JSON.stringify(body).substring(0, 200));

    const message = body.message;
    const callbackQuery = body.callback_query;

    if (message && message.text && message.chat) {
      await handleMessage(message);
    }

    if (callbackQuery && callbackQuery.message && callbackQuery.from) {
      await handleCallback(callbackQuery);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function handleMessage(message: any) {
  const chatId = message.chat.id;
  const text = message.text.trim();

  if (!rateLimit(`msg:${chatId}`, 30, 60_000)) {
    await sendMessage(chatId, '⏳ Please slow down and try again in a minute.');
    return;
  }

  if (text === '/start') {
    await sendMessage(
      chatId,
      '👋 Welcome to <b>AADL Check Bot</b>.\n\nPlease send me your <b>code</b>.',
      { force_reply: true, selective: true }
    );
    return;
  }

  const user = await getUserByChatId(String(chatId));

  if (!user || !user.code) {
    await upsertUser({ chat_id: String(chatId), code: text });
    await sendMessage(
      chatId,
      '✅ Code saved.\n\nNow please send me your <b>password</b>.',
      { force_reply: true, selective: true }
    );
    return;
  }

  if (!user.password) {
    await upsertUser({ chat_id: String(chatId), password: text });
    await sendMessage(
      chatId,
      '✅ Credentials saved securely.\n\nPress the button below to run the check.',
      buildRunCheckKeyboard()
    );
    return;
  }

  await sendMessage(
    chatId,
    'Your credentials are already saved. Press the button below to run the check.',
    buildRunCheckKeyboard()
  );
}

async function handleCallback(callbackQuery: any) {
  const chatId = callbackQuery.message.chat.id;
  const callbackId = callbackQuery.id;

  if (callbackQuery.data !== 'run_check') {
    await answerCallbackQuery(callbackId);
    return;
  }

  if (!rateLimit(`run:${chatId}`, 5, 60_000)) {
    await answerCallbackQuery(callbackId, '⏳ Please wait before running another check.');
    return;
  }

  await answerCallbackQuery(callbackId, '🔍 Running check...');
  await sendMessage(chatId, '🔍 Running your AADL check, please wait...');

  try {
    const user = await getUserByChatId(String(chatId));
    if (!user || !user.code || !user.password) {
      await sendMessage(
        chatId,
        '⚠️ Missing credentials. Please send /start to set them up.',
        { force_reply: true, selective: true }
      );
      return;
    }

    if (!RAILWAY_API_URL) {
      await sendMessage(chatId, '⚠️ Automation service is not configured.');
      return;
    }

    console.log(`📤 Sending request to Railway: ${RAILWAY_API_URL}/run`);
    console.log(`🔑 RAILWAY_API_SECRET is ${RAILWAY_API_SECRET ? '✅ SET' : '❌ MISSING'}`);

    // ✅ التعديل الأساسي: أضفنا /run إلى الرابط
    const response = await fetch(`${RAILWAY_API_URL}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Railway-Secret': RAILWAY_API_SECRET || '',
      },
      body: JSON.stringify({
        chat_id: String(chatId),
        code: user.code,
        password: user.password,
      }),
    });

    console.log(`📥 Railway response status: ${response.status}`);

    const data = await response.json().catch(() => ({
      status: 'error',
      message: 'Invalid response from automation service',
    }));

    console.log(`📦 Railway response data:`, JSON.stringify(data).substring(0, 300));

    if (data.status !== 'ok') {
      await sendMessage(
        chatId,
        `❌ Check failed:\n<pre>${escapeHtml(data.message || 'Unknown error')}</pre>\n\n` +
          'Please try again. If the problem persists, the CAPTCHA may be unreadable.'
      );
      return;
    }

    const status = data.verification_status || 'unknown';
    const captchaCode = data.captcha_code || 'N/A';
    const confidence = data.captcha_confidence || 0;

    let caption = '';
    if (status === 'success') {
      caption =
        '✅ <b>Verification successful</b> / <b>تم التحقق بنجاح</b>\n\n' +
        `🔢 CAPTCHA: <code>${escapeHtml(String(captchaCode))}</code>\n` +
        `🎯 Confidence: ${Math.round(Number(confidence))}%`;
    } else if (status === 'failure') {
      caption =
        '❌ <b>Verification failed</b> / <b>فشل التحقق</b>\n\n' +
        `🔢 CAPTCHA used: <code>${escapeHtml(String(captchaCode))}</code>\n` +
        `🎯 OCR confidence: ${Math.round(Number(confidence))}%\n\n` +
        'The CAPTCHA may have been read incorrectly, or the credentials are invalid.';
    } else {
      caption =
        '⚠️ <b>Verification status unknown</b> / <b>حالة التحقق غير معروفة</b>\n\n' +
        `🔢 CAPTCHA used: <code>${escapeHtml(String(captchaCode))}</code>\n` +
        `🎯 OCR confidence: ${Math.round(Number(confidence))}%\n\n` +
        'Please review the screenshot below.';
    }

    if (data.image_url) {
      await sendPhoto(chatId, data.image_url, caption);
    } else if (data.image_base64) {
      await sendPhotoBase64(chatId, data.image_base64, caption);
    } else {
      await sendMessage(chatId, caption);
    }
  } catch (error) {
    console.error('❌ Run check error:', error);
    await sendMessage(chatId, '❌ An error occurred while running the check.');
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
