const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = 'https://api.telegram.org';

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is not set');
}

async function callTelegram(method: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({ ok: false, description: 'Invalid JSON' }));
  if (!data.ok) {
    console.error(`Telegram API error (${method}):`, data);
  }
  return data;
}

export async function sendMessage(chatId: number, text: string, replyMarkup?: unknown) {
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
}

export async function sendPhoto(chatId: number, photoUrl: string, caption?: string) {
  return callTelegram('sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
  });
}

export async function sendPhotoBase64(chatId: number, base64DataUri: string, caption?: string) {
  const base64Data = base64DataUri.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const blob = new Blob([buffer], { type: 'image/png' });

  const formData = new FormData();
  formData.append('chat_id', String(chatId));
  formData.append('photo', blob, 'screen.png');
  if (caption) formData.append('caption', caption);
  formData.append('parse_mode', 'HTML');

  const res = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json().catch(() => ({ ok: false, description: 'Invalid JSON' }));
  if (!data.ok) {
    console.error('Telegram API error (sendPhoto base64):', data);
  }
  return data;
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return callTelegram('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
  });
}

export async function setWebhook(url: string, secretToken: string) {
  return callTelegram('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message', 'callback_query'],
  });
}

export function buildRunCheckKeyboard() {
  return {
    inline_keyboard: [[{ text: '🔍 Run Check', callback_data: 'run_check' }]],
  };
}
