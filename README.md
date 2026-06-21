# AADL Telegram Bot + Automation System

Production-ready full-stack system for checking AADL notaire status via Telegram.

## Architecture

```
┌─────────────┐     /start, code, password      ┌──────────────────────┐
│   Telegram  │ ───────────────────────────────▶│  Vercel (Next.js 14) │
│    User     │◀─────────────────────────────── │   Telegram Bot API   │
└─────────────┘    result screenshot + status   └──────────┬───────────┘
                                                           │ POST /api/run-check
                                                           ▼
                                                  ┌──────────────────────┐
                                                  │  Railway (Express)   │
                                                  │  Playwright Chromium │
                                                  │   Tesseract.js OCR   │
                                                  └──────────┬───────────┘
                                                             │
                                                             ▼
                                                    https://www.aadl.com.dz/notaire/
```

## Project Structure

```
Aadl/
├── vercel-bot/          # Next.js Telegram bot backend (Vercel)
├── railway-automation/  # Express + Playwright + Tesseract OCR automation (Railway)
├── supabase/
│   └── schema.sql       # Supabase users table
├── docs/
│   └── architecture.md  # Detailed architecture notes
└── README.md            # This file
```

## Components

### 1. Vercel Bot Backend (`vercel-bot/`)

- **Framework:** Next.js 14 (App Router)
- **Endpoints:**
  - `POST /api/webhook` - Receives Telegram updates
  - `POST /api/run-check` - Calls Railway automation service
  - `POST /api/set-webhook` - Registers webhook with Telegram
- **Features:**
  - Telegram webhook integration
  - `/start` command flow
  - AES-256-GCM encrypted password storage
  - Supabase primary database + SQLite local fallback
  - Webhook signature validation
  - Rate limiting
  - Displays CAPTCHA code, verification status, and result screenshot

### 2. Railway Automation Service (`railway-automation/`)

- **Framework:** Node.js + Express
- **Endpoint:** `POST /run`
- **Workflow:**
  1. Launch Playwright Chromium (headless)
  2. Navigate to `https://www.aadl.com.dz/notaire/`
  3. Fill `#code` and `#password`
  4. Wait for `#captchaImg` to load and capture it
  5. Pre-process the CAPTCHA image (grayscale, contrast, threshold, sharpen)
  6. Run Tesseract.js OCR with alphanumeric whitelist
  7. Retry with different pre-processing parameters if confidence is low
  8. Fill `#captcha` with the extracted code
  9. Click `#validateBtn` (or `button[type="submit"]` fallback)
  10. Detect verification status (`success`, `failure`, or `unknown`)
  11. Capture result screenshot and return JSON response

### 3. Database (`supabase/schema.sql`)

Table: `users`

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `chat_id` | text | Telegram chat ID (unique) |
| `code` | text | AADL code |
| `password` | text | Encrypted AADL password |
| `created_at` | timestamptz | Creation time |
| `updated_at` | timestamptz | Last update time |

## Environment Variables

### Vercel (`vercel-bot/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Telegram bot token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | Random secret for webhook validation |
| `NEXT_PUBLIC_VERCEL_URL` | Yes | Your Vercel deployment URL |
| `RAILWAY_API_URL` | Yes | Railway `/run` endpoint URL |
| `RAILWAY_API_SECRET` | Yes | Shared secret with Railway |
| `SUPABASE_URL` | No | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key |
| `ENCRYPTION_KEY` | Yes | 32-byte hex key (`openssl rand -hex 32`) |

### Railway (`railway-automation/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default 3000) |
| `RAILWAY_API_SECRET` | Yes | Shared secret with Vercel |
| `CLOUDINARY_CLOUD_NAME` | No | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | No | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | Cloudinary API secret |
| `CLOUDINARY_FOLDER` | No | Cloudinary folder |

## Deployment Steps

### 1. Create Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/botfather)
2. Run `/newbot` and follow instructions
3. Copy the bot token

### 2. Set Up Supabase (Recommended)

1. Create a project at [supabase.com](https://supabase.com)
2. Open SQL Editor
3. Run the contents of `supabase/schema.sql`
4. Copy project URL and service role key

### 3. Deploy Railway Automation Service

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app)
3. Create new project → Deploy from GitHub repo
4. Select the repo and set the root directory to `railway-automation/`
5. Add Railway environment variables
6. Deploy (the Dockerfile installs Playwright, Chromium, and Tesseract OCR)
7. Copy the deployed URL (`https://your-app.up.railway.app`)

### 4. Deploy Vercel Bot Backend

1. Go to [vercel.com](https://vercel.com)
2. Add new project → Import GitHub repo
3. Set root directory to `vercel-bot/`
4. Add Vercel environment variables
5. Deploy
6. Copy the deployed URL (`https://your-project.vercel.app`)

### 5. Register Telegram Webhook

```bash
curl -X POST https://your-project.vercel.app/api/set-webhook
```

Or open `https://your-project.vercel.app` and click the **Register Telegram Webhook** button.

### 6. Test the Bot

1. Open your bot in Telegram
2. Send `/start`
3. Send your AADL code
4. Send your AADL password
5. Press **"Run Check"**
6. The bot will return:
   - The solved CAPTCHA code
   - Verification status (success / failure / unknown)
   - A screenshot of the result page

## Security Notes

- Passwords are encrypted with AES-256-GCM before storage
- Telegram webhook signature is validated via secret token
- `/run-check` endpoint is rate-limited
- Railway endpoint requires `X-Railway-Secret` header

## Local Development

```bash
# Railway service
cd railway-automation
cp .env.example .env
npm install
npm run dev

# Vercel bot
cd vercel-bot
cp .env.example .env.local
npm install
npm run dev
```

For local Telegram testing, use [ngrok](https://ngrok.com) to expose your local Vercel dev server.

## Failure Handling

If the OCR engine fails to read the CAPTCHA after retries, the user receives an error message and can try again.

If the CAPTCHA is read but the form submission fails, the user still receives:
- The attempted CAPTCHA code
- A `failure` status
- A screenshot of the error page

## License

MIT
