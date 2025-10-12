const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());

const TEMP_DIR = path.resolve(__dirname, 'temp');
const COOKIES_PATH = path.resolve(__dirname, 'cookies.json');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

async function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

async function downloadFile(url, dest) {
  try {
    const response = await axios({
      method: "GET",
      url,
      responseType: "stream",
      timeout: 90000
    });
    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  } catch (error) {
    // پیام خطا را واضح‌تر می‌کنیم
    console.error(`خطا در دانلود فایل: ${error.message}. URL دریافت شده: ${url}`);
    throw new Error('دانلود فایل با مشکل مواجه شد.');
  }
}

async function postToInstagram({ videoUrl, caption }) {
  console.log('فرآیند آپلود ویدیو آغاز شد...');
  const videoPath = path.join(TEMP_DIR, 'video.mp4');

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
    if (fs.existsSync(COOKIES_PATH)) {
      console.log('در حال بارگذاری کوکی‌ها...');
      let cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      await page.setCookie(...cookies);
      console.log('کوکی‌ها با موفقیت بارگذاری شدند.');
    }

    console.log('گام 1: در حال باز کردن اینستاگرام...');
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('گام 2: در حال کلیک روی دکمه "Create"...');
    const createXpath = "//span[contains(text(),'Create')]";
    await page.waitForSelector('xpath/' + createXpath, { visible: true, timeout: 30000 });
    const [createButton] = await page.$$('xpath/' + createXpath);
    if (createButton) await createButton.click();

    console.log('گام 4 و 5: در حال انتخاب فایل از کامپیوتر...');
    const selectFromComputerXpath = "//button[normalize-space()='Select from computer']";
    await page.waitForSelector('xpath/' + selectFromComputerXpath, { visible: true, timeout: 15000 });
    const [selectButton] = await page.$$('xpath/' + selectFromComputerXpath);
    
    if (selectButton) {
      const [fileChooser] = await Promise.all([
          page.waitForFileChooser({ timeout: 10000 }),
          selectButton.click()
      ]);
      await fileChooser.accept([videoPath]);
      console.log('فایل برای آپلود انتخاب شد. منتظر پردازش ویدیو...');
      await delay(10000);
    }
    
    console.log('بررسی برای پاپ‌آپ "Video posts are now shared as reels"...');
    try {
        const okButtonXpath = "//button[contains(text(), 'OK')]";
        await page.waitForSelector('xpath/' + okButtonXpath, { visible: true, timeout: 7000 });
        const [okButton] = await page.$$('xpath/' + okButtonXpath);
        if (okButton) {
            console.log('پاپ‌آپ یافت شد. در حال کلیک روی "OK"...');
            await okButton.click();
            await delay(2000);
        }
    } catch (e) {
        console.log('پاپ‌آپ "Reels" یافت نشد، ادامه فرآیند...');
    }
    
    console.log('گام 6: تلاش برای پیدا کردن و کلیک روی آیکون برش (Crop)...');
    try {
        const cropIconSelector = "svg[aria-label='Select crop']";
        await page.waitForSelector(cropIconSelector, { visible: true, timeout: 20000 });
        await page.click(cropIconSelector);
        console.log('آیکون برش با موفقیت کلیک شد.');
        await delay(2000);

        console.log('گام 7 و 8: تلاش برای انتخاب برش پرتره (9:16)...');
        const ratioPortraitXpath = "//div[@role='button' and .//span[text()='9:16']]";
        const portraitButtonSelector = 'xpath/' + ratioPortraitXpath;

        await page.waitForSelector(portraitButtonSelector, { visible: true, timeout: 5000 });
        await page.click(portraitButtonSelector);
        
        console.log('برش پرتره (9:16) با موفقیت انتخاب شد.');
        await delay(2000);
        
    } catch(e) {
        console.error(`خطا در بخش برش ویدیو: ${e.message}`);
    }
    
    console.log('گام 9: کلیک روی دکمه "Next" اول...');
    const nextButtonXpath = "//div[contains(text(),'Next')]";
    await page.waitForSelector('xpath/' + nextButtonXpath, { visible: true, timeout: 15000 });
    const [nextBtn1] = await page.$$('xpath/' + nextButtonXpath);
    if (nextBtn1) await nextBtn1.click();
    
    console.log('گام 10: کلیک روی دکمه "Next" دوم...');
    await page.waitForSelector('xpath/' + nextButtonXpath, { visible: true, timeout: 10000 });
    const [nextBtn2] = await page.$$('xpath/' + nextButtonXpath);
    if (nextBtn2) await nextBtn2.click();

    console.log('گام 12: در حال نوشتن کپشن...');
    const captionSelector = "div[aria-label='Write a caption...']";
    await page.waitForSelector(captionSelector, { visible: true, timeout: 15000 });
    await page.type(captionSelector, caption, { delay: 50 });

    console.log('گام 13: در حال کلیک روی دکمه "Share"...');
    const shareButtonXpath = "//div[contains(text(),'Share')]";
    await page.waitForSelector('xpath/' + shareButtonXpath, { visible: true, timeout: 10000 });
    const [shareBtn] = await page.$$('xpath/' + shareButtonXpath);
    if (shareBtn) await shareBtn.click();
    
    console.log('منتظر تایید اشتراک‌گذاری پست... (حداکثر 5 دقیقه)');
    const successXpath = "//*[contains(text(),'Your reel has been shared.')]";
    await page.waitForSelector('xpath/' + successXpath, { timeout: 300000 });
    console.log('ویدیو با موفقیت آپلود و به اشتراک گذاشته شد!');

  } catch (err) {
    console.error('خطا در فرآیند آپلود اینستاگرام:', err.message);
    if (browser) {
        const pages = await browser.pages();
        if (pages.length > 0) {
            const errorScreenshotPath = path.join(TEMP_DIR, `error_screenshot_${Date.now()}.png`);
            await pages[0].screenshot({ path: errorScreenshotPath });
            console.log(`اسکرین شات خطا در مسیر زیر ذخیره شد: ${errorScreenshotPath}`);
        }
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log('مرورگر بسته شد.');
    }
  }
}

// Railway پورت را از طریق متغیر محیطی PORT به ما می‌دهد. اگر نبود، از 3000 استفاده می‌کنیم.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`سرور با موفقیت بر روی پورت ${PORT} اجرا شد.`);
});

  // --- **FIX**: اضافه کردن .trim() برای حذف فاصله‌های اضافی ---
  videoUrl = videoUrl.trim();

  postToInstagram({ videoUrl, caption });
  res.status(202).send("درخواست آپلود دریافت شد و فرآیند در پس‌زمینه آغاز گردید.");
});

app.listen(PORT, () => {
  console.log(`سرور با موفقیت بر روی پورت ${PORT} اجرا شد.`);
});