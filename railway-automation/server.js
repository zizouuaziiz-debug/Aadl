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
const { solveCaptcha } = require('./ocr-utils');

const app = express();
const PORT = process.env.PORT || 8080;
const RAILWAY_API_SECRET = process.env.RAILWAY_API_SECRET;

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.VERCEL_ORIGIN || '*' }));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute / دقيقة واحدة
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
// تأكد من صحة المفتاح السري المشترك بين Vercel وRailway
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

/**
 * Wait for the CAPTCHA image to be loaded and visible.
 * انتظر حتى تحميل صورة CAPTCHA وظهورها.
 *
 * @param {import('playwright').Page} page
 * @param {number} timeout
 */
async function waitForCaptchaImage(page, timeout = 15000) {
  await page.waitForSelector('#captchaImg', { state: 'visible', timeout });

  // Ensure the image element has a valid source and non-zero dimensions
  // تأكد من أن عنصر الصورة يحتوي على مصدر صالح وأبعاد غير صفرية
  await page.waitForFunction(
    () => {
      const img = document.querySelector('#captchaImg');
      return img && img.naturalWidth > 0 && img.naturalHeight > 0;
    },
    { timeout }
  );
}

/**
 * Capture the CAPTCHA image element to a file.
 * التقاط عنصر صورة CAPTCHA وحفظه في ملف.
 *
 * @param {import('playwright').Page} page
 * @param {string} outputPath
 */
async function captureCaptchaImage(page, outputPath) {
  const captchaImg = page.locator('#captchaImg');
  await captchaImg.screenshot({ path: outputPath, type: 'png' });
}

/**
 * Detect whether the form submission succeeded, failed, or is unknown.
 * تحديد ما إذا كان إرسال النموذج ناجحاً، فاشلاً، أو غير معروف.
 *
 * Heuristics:
 * - If the URL changed away from the login page, treat as success.
 * - If an error message selector is visible, treat as failure.
 * - Otherwise, treat as unknown.
 *
 * @param {import('playwright').Page} page
 * @param {string} initialUrl
 * @returns {Promise<string>} 'success' | 'failure' | 'unknown'
 */
async function detectVerificationStatus(page, initialUrl) {
  const currentUrl = page.url();

  // Success: page navigated away from the login form
  // نجاح: انتقلت الصفحة بعيداً عن نموذج تسجيل الدخول
  if (currentUrl !== initialUrl) {
    return 'success';
  }

  // Failure: common error indicators on AADL-like pages
  // فشل: مؤشرات خطأ شائعة في صفحات مشابهة لـ AADL
  const errorSelectors = [
    '.alert-danger',
    '.error-message',
    '.text-danger',
    '[role="alert"]',
  ];

  for (const selector of errorSelectors) {
    const visible = await page.locator(selector).isVisible().catch(() => false);
    if (visible) return 'failure';
  }

  return 'unknown';
}

/**
 * Submit the login form with credentials and the solved CAPTCHA.
 * إرسال نموذج تسجيل الدخول مع بيانات الاعتماد وCAPTCHA المحلول.
 *
 * @param {import('playwright').Page} page
 * @param {string} captchaCode
 */
async function submitFormWithCaptcha(page, captchaCode) {
  await page.fill('#captcha', captchaCode);

  // Click the validation button, falling back to the first submit button
  // اضغط على زر التحقق، مع الرجوع إلى زر الإرسال الأول
  const validateButton = page.locator('#validateBtn');
  if (await validateButton.count() > 0) {
    await validateButton.click();
  } else {
    await page.locator('button[type="submit"]').first().click();
  }
}

// Main automation endpoint
app.post('/run', authorizeRailway, validateRunPayload, async (req, res) => {
  const { chat_id, code, password } = req.body;
  const screenshotPath = '/tmp/screen.png';
  const captchaPath = '/tmp/captcha_raw.png';

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
    const initialUrl = 'https://www.aadl.com.dz/notaire/';

    console.log(`[${chat_id}] Navigating to AADL notaire page...`);
    await page.goto(initialUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for form fields / انتظر حقول النموذج
    await page.waitForSelector('#code', { timeout: 10000 });
    await page.waitForSelector('#password', { timeout: 10000 });

    console.log(`[${chat_id}] Filling credentials...`);
    await page.fill('#code', code);
    await page.fill('#password', password);

    // Wait for and capture the CAPTCHA image
    // انتظر صورة CAPTCHA والتقطها
    console.log(`[${chat_id}] Waiting for CAPTCHA image...`);
    await waitForCaptchaImage(page);
    await captureCaptchaImage(page, captchaPath);
    console.log(`[${chat_id}] CAPTCHA image saved to ${captchaPath}`);

    // Solve the CAPTCHA using OCR
    // حل CAPTCHA باستخدام OCR
    console.log(`[${chat_id}] Running OCR on CAPTCHA...`);
    const { code: captchaCode, confidence, attempts } = await solveCaptcha(captchaPath);

    if (!captchaCode) {
      throw new Error('CAPTCHA OCR failed: could not extract any text after retries');
    }

    console.log(`[${chat_id}] CAPTCHA solved: "${captchaCode}" (confidence: ${confidence})`);

    // Submit the form with the solved CAPTCHA
    // أرسل النموذج مع CAPTCHA المحلول
    console.log(`[${chat_id}] Submitting form with CAPTCHA...`);
    await submitFormWithCaptcha(page, captchaCode);

    // Wait for the result to load
    // انتظر تحميل النتيجة
    await page.waitForTimeout(3000);

    // Detect success or failure
    // تحديد النجاح أو الفشل
    const verificationStatus = await detectVerificationStatus(page, initialUrl);
    console.log(`[${chat_id}] Verification status: ${verificationStatus}`);

    // Capture the final result screenshot
    // التقط صورة للنتيجة النهائية
    console.log(`[${chat_id}] Capturing result screenshot...`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    await browser.close();
    browser = null;

    const imageUrl = await uploadScreenshot(screenshotPath);
    const imageBase64 = fileToBase64(screenshotPath);

    return res.json({
      status: 'ok',
      message: `CAPTCHA solved and submitted. Verification status: ${verificationStatus}.`,
      chat_id,
      captcha_code: captchaCode,
      captcha_confidence: confidence,
      verification_status: verificationStatus,
      image_url: imageUrl,
      image_base64: imageBase64 ? `data:image/png;base64,${imageBase64}` : undefined,
      ocr_attempts: attempts,
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
