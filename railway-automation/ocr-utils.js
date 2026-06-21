/**
 * OCR Utilities for AADL CAPTCHA solving
 * أدوات التعرف البصري على الأحرف (OCR) لحل CAPTCHA الخاصة بـ AADL
 *
 * This module:
 * - Pre-processes CAPTCHA images (grayscale, contrast, threshold, sharpen)
 * - Runs Tesseract.js OCR with numeric whitelist ONLY (because AADL CAPTCHA uses digits)
 * - Retries with different pre-processing parameters on failure
 * - Cleans and validates the extracted text
 */

const path = require('path');
const sharp = require('sharp');
const { createWorker, PSM } = require('tesseract.js');

// Minimum confidence required for an OCR attempt to be accepted
// الحد الأدنى للثقة المطلوبة لقبول محاولة OCR
const MIN_CONFIDENCE = 50; // ✅ خفضت قليلاً لأن الأرقام أسهل

// Maximum number of OCR retries with different image pre-processing settings
// أقصى عدد من محاولات OCR مع إعدادات معالجة صورة مختلفة
const MAX_RETRIES = 3;

// ✅ تغيير مهم: الأرقام فقط لأن CAPTCHA في AADL هي أرقام
const CAPTCHA_WHITELIST = '0123456789';

/**
 * Clean the raw OCR text by keeping only allowed characters.
 * تنظيف النص الخام من OCR بالاحتفاظ بالأحرف المسموح بها فقط.
 *
 * @param {string} text
 * @returns {string}
 */
function cleanCaptchaText(text) {
  if (!text) return '';
  return text
    .replace(/[^0-9]/g, '') // ✅ إزالة كل ما ليس رقماً
    .trim();
}

/**
 * Pre-process a CAPTCHA image to improve OCR accuracy.
 * معالجة صورة CAPTCHA مسبقاً لتحسين دقة OCR.
 *
 * @param {string} inputPath - Path to the raw CAPTCHA image
 * @param {string} outputPath - Path to write the processed image
 * @param {Object} options
 * @param {number} options.threshold - Binarization threshold (0-255)
 * @param {boolean} options.sharpen - Whether to apply sharpening
 * @returns {Promise<string>} - Resolves to outputPath
 */
async function preprocessCaptcha(inputPath, outputPath, options = {}) {
  const { threshold = 128, sharpen = true } = options;

  let pipeline = sharp(inputPath)
    .greyscale() // Convert to grayscale / تحويل إلى تدرج رمادي
    .normalize() // Auto contrast stretch / تمدد التباين التلقائي
    .threshold(threshold); // Binarization / تحويل إلى أبيض وأسود

  if (sharpen) {
    pipeline = pipeline.sharpen({ sigma: 1, flat: 1, jagged: 2 });
  }

  await pipeline.toFile(outputPath);
  return outputPath;
}

/**
 * Run Tesseract.js OCR on a single image.
 * تشغيل Tesseract.js OCR على صورة واحدة.
 *
 * @param {string} imagePath
 * @returns {Promise<{text: string, confidence: number}>}
 */
async function runOcr(imagePath) {
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
      }
    },
    errorHandler: (e) => console.error('Tesseract worker error:', e),
  });

  try {
    await worker.setParameters({
      tessedit_char_whitelist: CAPTCHA_WHITELIST, // ✅ أرقام فقط
      tessedit_pageseg_mode: PSM.SINGLE_WORD,
      tessedit_ocr_engine_mode: '3', // ✅ LSTM + Legacy
    });

    const {
      data: { text, confidence },
    } = await worker.recognize(imagePath);

    return { text: cleanCaptchaText(text), confidence };
  } finally {
    await worker.terminate();
  }
}

/**
 * Attempt to solve a CAPTCHA image with retries.
 * محاولة حل صورة CAPTCHA مع إعادة المحاولة.
 *
 * @param {string} inputPath - Path to the raw CAPTCHA screenshot
 * @returns {Promise<{code: string|null, confidence: number, attempts: Array}>}
 */
async function solveCaptcha(inputPath) {
  const attempts = [];
  const thresholds = [128, 160, 96, 200, 80]; // ✅ إضافة المزيد من العتبات
  const sharpenFlags = [true, false, true, false, true];

  for (let i = 0; i < MAX_RETRIES; i++) {
    const outputPath = path.join(
      path.dirname(inputPath),
      `captcha_processed_${i}.png`
    );

    try {
      await preprocessCaptcha(inputPath, outputPath, {
        threshold: thresholds[i % thresholds.length],
        sharpen: sharpenFlags[i % sharpenFlags.length],
      });

      const { text, confidence } = await runOcr(outputPath);
      attempts.push({ attempt: i + 1, text, confidence });

      console.log(`OCR attempt ${i + 1}: "${text}" (confidence: ${confidence})`);

      // ✅ قبول النتيجة إذا كانت غير فارغة وثقتها أعلى من الحد الأدنى
      // ✅ أو إذا كانت تحتوي على أرقام فقط (حتى لو كانت الثقة منخفضة)
      if (text && text.length >= 3 && (confidence >= MIN_CONFIDENCE || /^[0-9]+$/.test(text))) {
        console.log(`✅ OCR accepted: "${text}" with confidence ${confidence}`);
        return { code: text, confidence, attempts };
      }
    } catch (err) {
      console.error(`OCR attempt ${i + 1} failed:`, err.message);
      attempts.push({ attempt: i + 1, error: err.message });
    }
  }

  // If all retries failed but we still got some text, return the best attempt
  const bestAttempt = attempts
    .filter((a) => a.text && a.text.length >= 3)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];

  return {
    code: bestAttempt ? bestAttempt.text : null,
    confidence: bestAttempt ? bestAttempt.confidence : 0,
    attempts,
  };
}

module.exports = {
  solveCaptcha,
  preprocessCaptcha,
  cleanCaptchaText,
  CAPTCHA_WHITELIST,
  MIN_CONFIDENCE,
  MAX_RETRIES,
};
