# Architecture Details

## Security

### Telegram Webhook Validation

When registering the webhook via `/api/set-webhook`, a `secret_token` is sent to Telegram. Telegram includes this token in every update as the `X-Telegram-Bot-Api-Secret-Token` header. The `/api/webhook` route rejects requests without a matching secret.

### Password Encryption

Passwords are encrypted using AES-256-GCM with a random IV and authentication tag per record. The encryption key must be a 32-byte hex string set in `ENCRYPTION_KEY`.

### Railway Authorization

Vercel calls Railway with a shared secret in the `X-Railway-Secret` header. Railway rejects requests without the correct secret.

## Rate Limiting

A simple in-memory rate limiter is used for both message handling and `/run-check` calls. For production multi-region deployments, consider replacing this with Redis or Vercel KV.

## Conversation Flow

```
/start
  └─> "Please send me your code."
      └─> save code
          └─> "Please send me your password."
              └─> encrypt & save password
                  └─> show "Run Check" button
                      └─> call Railway
                          └─> send screenshot
```

## Error Handling

- Database errors return a 500 response to Telegram (Telegram will retry)
- Railway errors are sent back to the user as a Telegram message
- Missing credentials prompt the user to run `/start`
