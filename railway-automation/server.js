require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cloudinary = require('./lib/cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;
const RAILWAY_API_SECRET = process.env.RAILWAY_API_SECRET;

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.VERCEL_ORIGIN || '*' }));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests, please try again later.' },
});
app.use('/run', limiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'aadl-railway-automation' });
});

// Authorization middleware
function authorizeRailway(req, res, next) {
  const secret = req.headers['x-railway-secret'];
  if (!RAILWAY_API_SECRET) {
    console.warn('RAILWAY_API_SECRET is not set. Skipping authorization.');
    return next();
  }
  if (!secret || secret !== RAILWAY_API_SECRET) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  next();
}

function validateRunPayload(req, res, next) {
  const { chat_id, code, password } = req.body || {};
  if (!chat_id || !code || !password) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields: chat_id, code, password',
    });
  }
  next();
}

async function ensureScreenshotDir() {
  const dir = path.dirname('/tmp/screen.png');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function uploadScreenshot(filePath) {
  if (!cloudinary.enabled) return null;
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: process.env.CLOUDINARY_FOLDER || 'aadl_screenshots',
      public_id: `aadl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      resource_type: 'image',
    });
    return result.secure_url;
  } catch (err) {
    console.error('Cloudinary upload failed:', err.message);
    return null;
  }
}

function fileToBase64(filePath) {
  try {
    return fs.readFileSync(filePath, { encoding: 'base64' });
  } catch (err) {
    console.error('Base64 conversion failed:', err.message);
    return null;
  }
}

// Main automation endpoint
app.post('/run', authorizeRailway, validateRunPayload, async (req, res) => {
  const { chat_id, code, password } = req.body;
  const screenshotPath = '/tmp/screen.png';

  let browser;
  try {
    await ensureScreenshotDir();

    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    console.log(`[${chat_id}] Navigating to AADL notaire page...`);
    await page.goto('https://www.aadl.com.dz/notaire/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for form fields
    await page.waitForSelector('#code', { timeout: 10000 });
    await page.waitForSelector('#password', { timeout: 10000 });

    console.log(`[${chat_id}] Filling credentials...`);
    await page.fill('#code', code);
    await page.fill('#password', password);

    // Optional: trigger any UI state changes
    await page.click('#code');
    await page.click('#password');

    // Take screenshot BEFORE any CAPTCHA interaction
    console.log(`[${chat_id}] Capturing screenshot before CAPTCHA...`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Wait 5-10 seconds for manual CAPTCHA completion (optional delay)
    const delayMs = Math.floor(Math.random() * 5000) + 5000;
    console.log(`[${chat_id}] Waiting ${delayMs}ms for manual intervention window...`);
    await page.waitForTimeout(delayMs);

    await browser.close();
    browser = null;

    const imageUrl = await uploadScreenshot(screenshotPath);
    const imageBase64 = fileToBase64(screenshotPath);

    return res.json({
      status: 'ok',
      message: 'Screenshot captured before CAPTCHA. Complete the CAPTCHA manually on the website.',
      chat_id,
      image_url: imageUrl,
      image_base64: imageBase64 ? `data:image/png;base64,${imageBase64}` : undefined,
    });
  } catch (error) {
    console.error(`[${chat_id}] Automation error:`, error);
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Automation failed',
      chat_id,
    });
  }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`AADL Railway automation service listening on port ${PORT}`);
});
