FROM node:18-slim

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm-dev \
    libxkbcommon-dev \
    libgbm1 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# Install Playwright browsers
RUN npx playwright install chromium

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
