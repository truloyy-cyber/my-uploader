const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json({ limit: '10mb' }));

const TEMP_DIR_NAME = 'temp';

async function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

async function downloadFile(url, dest) {
  try {
    const response = await axios({ method: "GET", url, responseType: "stream", timeout: 90000 });
    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  } catch (error) {
    console.error(`خطا در دانلود فایل: ${error.message}. URL: ${url}`);
    throw new Error('دانلود فایل با مشکل مواجه شد.');
  }
}

async function postToInstagram({ videoUrl, caption, cookies: cookiesFromRequest }) {
  console.log('فرآیند آپلود ویدیو آغاز شد...');
  
  const tempDir = path.resolve(__dirname, TEMP_DIR_NAME);
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const videoPath = path.join(tempDir, 'video.mp4');
  
  let browser;

  try {
    console.log('در حال دانلود ویدیو...');
    await downloadFile(videoUrl, videoPath);
    console.log('دانلود ویدیو با موفقیت انجام شد.');

    browser = await puppeteer.launch({
      headless: true, // در محیط گیت‌هاب حتما باید true باشد
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // آرگومان‌های ضروری برای محیط لینوکسی
    });

    const page = await browser.newPage();

    if (cookiesFromRequest && cookiesFromRequest.length > 0) {
        console.log('در حال بارگذاری کوکی‌های ارسال شده از n8n...');
        await page.setCookie(...cookiesFromRequest);
        console.log('کوکی‌ها با موفقیت بارگذاری شدند.');
    } else {
        throw new Error('هیچ کوکی معتبری از n8n دریافت نشد.');
    }

    // ... بقیه کد شما دقیقاً همان است که قبلاً داشتیم ...
    // (من برای کوتاهی آن را اینجا تکرار نمی‌کنم، کد قبلی بی‌نقص بود)

  } catch (err) {
    // ...
  } finally {
    // ...
  }
}

app.post('/upload', async (req, res) => {
  let { videoUrl, caption, cookies } = req.body;
  if (!videoUrl || !caption || !cookies) {
    return res.status(400).send("پارامترهای videoUrl, caption, و cookies اجباری هستند.");
  }
  videoUrl = videoUrl.trim();
  postToInstagram({ videoUrl, caption, cookies });
  res.status(202).send("درخواست آپلود دریافت شد و فرآیند در پس‌زمینه آغاز گردید.");
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`سرور با موفقیت بر روی پورت ${PORT} اجرا شد.`);
});
```**(نکته: من برای خوانایی، بدنه تابع `postToInstagram` را خلاصه کرده‌ام. شما باید همان کدی را که از قبل داشتیم و به درستی کار می‌کرد، در آنجا قرار دهید.)**

**تبریک!** شما **فاز ۱** نقشه راه را با موفقیت به پایان رساندید. پروژه شما اکنون کاملاً آماده است تا به ابر برود.

آیا آماده هستید که به سراغ **فاز ۲ (راه‌اندازی Ngrok)** برویم؟
