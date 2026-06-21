# AADL Railway Automation Service

Playwright-based automation service that fills the AADL notaire form, solves the CAPTCHA using OCR, and returns the verification result screenshot.

خادم الأتمتة القائم على Playwright لملء نموذج AADL notaire، وحل CAPTCHA باستخدام OCR، وإرجاع لقطة شاشة لنتيجة التحقق.

## Endpoints

- `GET /health` - Health check / فحص الحالة
- `POST /run` - Runs the Playwright + OCR workflow / تشغيل سير عمل Playwright + OCR

## Request

```http
POST /run
Content-Type: application/json
X-Railway-Secret: your_secret

{
  "chat_id": "123456789",
  "code": "ABC123",
  "password": "secret"
}
```

## Response

```json
{
  "status": "ok",
  "message": "CAPTCHA solved and submitted. Verification status: success.",
  "chat_id": "123456789",
  "captcha_code": "X7B9K",
  "captcha_confidence": 87,
  "verification_status": "success",
  "image_url": "https://...",
  "image_base64": "data:image/png;base64,...",
  "ocr_attempts": [
    { "attempt": 1, "text": "X7B9K", "confidence": 87 },
    { "attempt": 2, "text": "X7B9", "confidence": 72 }
  ]
}
```

### `verification_status` values / قيم حالة التحقق

| Value | Meaning |
|-------|---------|
| `success` | Page navigated away from the login form / انتقلت الصفحة بعيداً عن نموذج تسجيل الدخول |
| `failure` | Error indicator visible on the page / مؤشر خطأ ظاهر على الصفحة |
| `unknown` | Could not determine the result / لم يكن تحديد النتيجة ممكناً |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `RAILWAY_API_SECRET` | Yes | Secret key shared with Vercel backend |
| `CLOUDINARY_CLOUD_NAME` | No | Cloudinary cloud name for image upload |
| `CLOUDINARY_API_KEY` | No | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | Cloudinary API secret |
| `CLOUDINARY_FOLDER` | No | Cloudinary folder (default: `aadl_screenshots`) |

## Local Development

```bash
cd railway-automation
cp .env.example .env
npm install
npm run dev
```

## Deployment (Railway)

1. Push this folder to a Git repo.
2. Create a new Railway project from the repo.
3. Add environment variables in the Railway dashboard.
4. Railway will use the included `Dockerfile` to install Playwright, Chromium, Tesseract OCR, and Node dependencies.
5. Copy the deployed domain (e.g., `https://aadl-automation.up.railway.app`) for the Vercel backend.

## Failure Handling Example / مثال على التعامل مع حالات الفشل

If the OCR engine cannot read the CAPTCHA after all retries, the service returns an error so the Vercel bot can notify the user:

```json
{
  "status": "error",
  "message": "CAPTCHA OCR failed: could not extract any text after retries",
  "chat_id": "123456789"
}
```

If the CAPTCHA is read but the form submission fails (e.g., wrong code/password/CAPTCHA), the service still returns `status: "ok"` with `verification_status: "failure"` and a result screenshot:

```json
{
  "status": "ok",
  "message": "CAPTCHA solved and submitted. Verification status: failure.",
  "chat_id": "123456789",
  "captcha_code": "X7B9K",
  "captcha_confidence": 87,
  "verification_status": "failure",
  "image_url": "https://...",
  "image_base64": "data:image/png;base64,...",
  "ocr_attempts": [...]
}
```

### How the Vercel bot handles failures / كيف يتعامل بوت Vercel مع حالات الفشل

- `success`: sends a success caption with the solved CAPTCHA code.
- `failure`: sends a failure caption suggesting the user check credentials or try again.
- `unknown`: asks the user to review the returned screenshot.
- `status: "error"`: sends the error message returned by Railway.

## CAPTCHA Solving Flow / سير عمل حل CAPTCHA

1. Navigate to `https://www.aadl.com.dz/notaire/`
2. Fill `#code` and `#password`
3. Wait for `#captchaImg` to load
4. Capture the CAPTCHA element screenshot
5. Pre-process the image (grayscale, contrast, threshold, sharpen)
6. Run Tesseract.js OCR with alphanumeric whitelist
7. Retry with different pre-processing settings if confidence is low
8. Fill `#captcha` with the extracted code
9. Click `#validateBtn` (or `button[type="submit"]` as fallback)
10. Wait for the result page and detect `success` / `failure` / `unknown`
11. Capture and return the result screenshot
