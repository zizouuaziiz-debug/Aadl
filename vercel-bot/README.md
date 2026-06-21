# AADL Vercel Telegram Bot Backend

Next.js 14 backend that powers the AADL Telegram bot using webhooks.

## Features

- Telegram webhook integration (`/api/webhook`)
- `/start` command: asks for code, then password
- Secure credential storage with AES-256-GCM encryption
- Supabase primary database with SQLite local fallback
- "Run Check" inline keyboard
- Calls Railway Playwright automation service (`/api/run-check`)
- Receives CAPTCHA code, verification status, and result screenshot
- Telegram webhook signature validation
- Rate limiting

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/webhook` | POST | Receives Telegram updates |
| `/api/run-check` | POST | Runs check for a given `chat_id` |
| `/api/set-webhook` | POST | Registers Telegram webhook with Telegram API |

## Telegram Flow

1. User sends `/start`
2. Bot asks for **code**
3. User replies with code
4. Bot asks for **password**
5. User replies with password
6. Bot saves encrypted password and shows **"Run Check"** button
7. User presses button
8. Bot calls Railway automation service
9. Railway solves the CAPTCHA with OCR, submits the form, and returns the result
10. Bot sends the user:
    - The solved CAPTCHA code
    - Verification status (success / failure / unknown)
    - A screenshot of the result page

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Telegram bot token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | Random secret for webhook validation |
| `NEXT_PUBLIC_VERCEL_URL` | Yes | Your Vercel deployment URL |
| `RAILWAY_API_URL` | Yes | Railway `/run` endpoint URL |
| `RAILWAY_API_SECRET` | Yes | Shared secret with Railway service |
| `SUPABASE_URL` | No | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key |
| `ENCRYPTION_KEY` | Yes | 32-byte hex encryption key |

## Generate Encryption Key

```bash
openssl rand -hex 32
```

## Local Development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Then call `/api/set-webhook` to register the webhook (use a tunnel like ngrok for local testing).

## Deployment (Vercel)

1. Push this folder to Git.
2. Import project in Vercel.
3. Add all environment variables.
4. Deploy.
5. Call `POST /api/set-webhook` once after deployment.
