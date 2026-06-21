# AADL Railway Automation Service

Playwright-based automation service that fills the AADL notaire form and captures a screenshot **before** the CAPTCHA step.

## Endpoints

- `GET /health` - Health check
- `POST /run` - Runs the Playwright workflow

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
  "message": "Screenshot captured before CAPTCHA. Complete the CAPTCHA manually on the website.",
  "chat_id": "123456789",
  "image_url": "https://...",
  "image_base64": "data:image/png;base64,..."
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `RAILWAY_API_SECRET` | Yes | Secret key shared with Vercel backend |
| `CLOUDINARY_CLOUD_NAME` | No | Cloudinary cloud name for image upload |
| `CLOUDINARY_API_KEY` | No | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | Cloudinary API secret |
| `CLOUDINARY_FOLDER` | No | Cloudinary folder (default: `aadl_screenshots`) |

## Deployment (Railway)

1. Push this folder to a Git repo.
2. Create a new Railway project from the repo.
3. Add environment variables in Railway dashboard.
4. Railway will install dependencies and run `npm start`.
5. Copy the deployed domain (e.g., `https://aadl-automation.up.railway.app`) for the Vercel backend.
