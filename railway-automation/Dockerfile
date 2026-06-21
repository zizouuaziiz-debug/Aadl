FROM node:18-slim

# Install Playwright dependencies and Tesseract OCR
# تثبيت تبعيات Playwright و Tesseract OCR
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm-dev \
    libxkbcommon-dev \
    libgbm1 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence-dev \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxrender1 \
    libxtst6 \
    libxi6 \
    tesseract-ocr \
    tesseract-ocr-eng \
    libtesseract-dev \
    && rm -rf /var/lib/apt/lists/*

# تعيين متغيرات البيئة
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

WORKDIR /app

COPY package*.json ./

# ✅ استخدم npm install بدلاً من npm ci لتجنب مشاكل القفل
RUN npm install

# ✅ تأكد من تثبيت Chromium مع جميع التبعيات
RUN npx playwright install chromium --with-deps

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
