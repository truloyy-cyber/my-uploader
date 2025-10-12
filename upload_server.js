const express = require('express');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json({ limit: '10mb' })); // افزایش محدودیت برای دریافت کوکی‌های حجیم

// TEMP_DIR حالا داخل تابع ساخته می‌شود چون در محیط ابری فقط یک پوشه temp موقت نیاز داریم
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

// تابع اصلی حالا کوکی‌ها را به عنوان پارامتر دریافت می‌کند
async function postToInstagram({ videoUrl, caption, cookies: cookiesFromRequest }) {
  console.log('فرآیند آپلود ویدیو آغاز شد...');
  
  // ساخت پوشه temp به صورت دینامیک
  const tempDir = path.resolve(__dirname, TEMP_DIR_NAME);
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const videoPath = path.join(tempDir, 'video.mp4');
  
  let browser;

  try {
    console.log('در حال دانلود ویدیو...');
    await downloadFile(videoUrl, videoPath);
    console.log('دانلود ویدیو با موفقیت انجام شد.');

    browser = await puppeteer.launch({
      headless: true,
      defaultViewport: { width: 1366, height: 768 },
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // منطق جدید برای بارگذاری کوکی‌ها از درخواست n8n
    if (cookiesFromRequest && cookiesFromRequest.length > 0) {
        console.log('در حال بارگذاری کوکی‌های ارسال شده از n8n...');
        await page.setCookie(...cookiesFromRequest);
        console.log('کوکی‌ها با موفقیت بارگذاری شدند.');
    } else {
        throw new Error('هیچ کوکی معتبری از n8n دریافت نشد.');
    }

    // بقیه کد آپلود بدون تغییر
    console.log('گام 1: باز کردن اینستاگرام...');
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('گام 2: کلیک روی دکمه "Create"...');
    const createXpath = "//span[contains(text(),'Create')]";
    await page.waitForSelector('xpath/' + createXpath, { visible: true, timeout: 30000 });
    const [createButton] = await page.$$('xpath/' + createXpath);
    if (createButton) await createButton.click();
    console.log('گام 4 و 5: انتخاب فایل از کامپیوتر...');
    const selectFromComputerXpath = "//button[normalize-space()='Select from computer']";
    await page.waitForSelector('xpath/' + selectFromComputerXpath, { visible: true, timeout: 15000 });
    const [selectButton] = await page.$$('xpath/' + selectFromComputerXpath);
    if (selectButton) {
      const [fileChooser] = await Promise.all([page.waitForFileChooser({ timeout: 10000 }), selectButton.click()]);
      await fileChooser.accept([videoPath]);
      console.log('فایل انتخاب شد، منتظر پردازش...');
      await delay(10000);
    }
    console.log('بررسی برای پاپ‌آپ Reels...');
    try {
      const okButtonXpath = "//button[contains(text(), 'OK')]";
      await page.waitForSelector('xpath/' + okButtonXpath, { visible: true, timeout: 7000 });
      const [okButton] = await page.$$('xpath/' + okButtonXpath);
      if (okButton) {
        console.log('پاپ‌آپ یافت شد، کلیک روی "OK"...');
        await okButton.click();
        await delay(2000);
      }
    } catch (e) { console.log('پاپ‌آپ Reels یافت نشد.'); }
    console.log('گام 6: کلیک روی آیکون برش (Crop)...');
    try {
      const cropIconSelector = "svg[aria-label='Select crop']";
      await page.waitForSelector(cropIconSelector, { visible: true, timeout: 20000 });
      await page.click(cropIconSelector);
      console.log('آیکون برش کلیک شد.');
      await delay(2000);
      console.log('گام 7 و 8: انتخاب برش پرتره (9:16)...');
      const ratioPortraitXpath = "//div[@role='button' and .//span[text()='9:16']]";
      await page.waitForSelector('xpath/' + ratioPortraitXpath, { visible: true, timeout: 5000 });
      await page.click('xpath/' + ratioPortraitXpath);
      console.log('برش پرتره انتخاب شد.');
      await delay(2000);
    } catch (e) { console.error(`خطا در بخش برش ویدیو: ${e.message}`); }
    console.log('گام 9: کلیک روی "Next" اول...');
    const nextButtonXpath = "//div[contains(text(),'Next')]";
    await page.waitForSelector('xpath/' + nextButtonXpath, { visible: true, timeout: 15000 });
    const [nextBtn1] = await page.$$('xpath/' + nextButtonXpath);
    if (nextBtn1) await nextBtn1.click();
    console.log('گام 10: کلیک روی "Next" دوم...');
    await page.waitForSelector('xpath/' + nextButtonXpath, { visible: true, timeout: 10000 });
    const [nextBtn2] = await page.$$('xpath/' + nextButtonXpath);
    if (nextBtn2) await nextBtn2.click();
    console.log('گام 12: نوشتن کپشن...');
    const captionSelector = "div[aria-label='Write a caption...']";
    await page.waitForSelector(captionSelector, { visible: true, timeout: 15000 });
    await page.type(captionSelector, caption, { delay: 50 });
    console.log('گام 13: کلیک روی "Share"...');
    const shareButtonXpath = "//div[contains(text(),'Share')]";
    await page.waitForSelector('xpath/' + shareButtonXpath, { visible: true, timeout: 10000 });
    const [shareBtn] = await page.$$('xpath/' + shareButtonXpath);
    if (shareBtn) await shareBtn.click();
    console.log('منتظر تایید اشتراک‌گذاری... (حداکثر 5 دقیقه)');
    const successXpath = "//*[contains(text(),'Your reel has been shared.')]";
    await page.waitForSelector('xpath/' + successXpath, { timeout: 300000 });
    console.log('ویدیو با موفقیت آپلود شد!');

  } catch (err) {
    console.error('خطا در فرآیند آپلود:', err.message);
    if (browser) {
      const pages = await browser.pages();
      if (pages.length > 0) {
        const errorScreenshotPath = path.join(tempDir, `error_screenshot_${Date.now()}.png`);
        await pages[0].screenshot({ path: errorScreenshotPath });
        console.log(`اسکرین شات خطا ذخیره شد: ${errorScreenshotPath}`);
      }
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log('مرورگر بسته شد.');
    }
  }
}

// ** FIX: بخش دریافت درخواست به شکل صحیح و نهایی **
app.post('/upload', async (req, res) => {
  // حالا کوکی‌ها را هم از بدنه درخواست می‌خوانیم
  let { videoUrl, caption, cookies } = req.body;
  
  if (!videoUrl || !caption || !cookies) {
    return res.status(400).send("پارامترهای videoUrl, caption, و cookies اجباری هستند.");
  }

  videoUrl = videoUrl.trim();

  // ارسال تمام پارامترها به تابع اصلی
  postToInstagram({ videoUrl, caption, cookies });
  
  res.status(202).send("درخواست آپلود دریافت شد و فرآیند در پس‌زمینه آغاز گردید.");
});

// Railway پورت را از طریق متغیر محیطی PORT به ما می‌دهد.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`سرور با موفقیت بر روی پورت ${PORT} اجرا شد.`);
});

