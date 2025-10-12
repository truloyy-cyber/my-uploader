# از یک نسخه بهینه Node.js استفاده کن
FROM node:18-slim

# یک پوشه برای برنامه داخل محیط اجرایی بساز
WORKDIR /app

# فایل شناسنامه پروژه را کپی کن
COPY package*.json ./

# نیازمندی‌های سیستم‌عامل لینوکس برای اجرای مرورگر Chromium را نصب کن
RUN apt-get update \
    && apt-get install -yq gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
    libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
    libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
    ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget chromium

# نیازمندی‌های Node.js (axios, express, puppeteer) را نصب کن
RUN npm install

# تمام کدهای پروژه را به داخل محیط اجرایی کپی کن
COPY . .

# به Puppeteer بگو که از کدام نسخه مرورگر استفاده کند
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# دستور نهایی برای اجرای برنامه

CMD ["npm", "start"]
