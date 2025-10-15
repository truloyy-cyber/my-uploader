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

// ============ تابع آپلود در اینستاگرام ============
async function postToInstagram({ page, videoPath, caption, cookies }) {
    console.log('\n--- فرآیند آپلود در اینستاگرام آغاز شد ---');
    try {
        if (!cookies || cookies.length === 0) throw new Error('کوکی‌های اینستاگرام یافت نشد.');
        await page.setCookie(...cookies);
        console.log('کوکی‌های اینستاگرام بارگذاری شدند.');
        await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
        console.log('اینستاگرام باز شد.');
        
        const createXpath = "//*[local-name()='svg' and @aria-label='New post'] | //span[contains(text(),'Create')]";
        await page.waitForSelector(`xpath/${createXpath}`, { visible: true });
        const [createButton] = await page.$$(`xpath/${createXpath}`);
        await createButton.click();

        const selectFromComputerXpath = "//button[normalize-space()='Select from computer']";
        await page.waitForSelector(`xpath/${selectFromComputerXpath}`, { visible: true });
        const [selectButton] = await page.$$(`xpath/${selectFromComputerXpath}`);
        const [fileChooser] = await Promise.all([page.waitForFileChooser(), selectButton.click()]);
        await fileChooser.accept([videoPath]);
        console.log('فایل برای اینستاگرام انتخاب شد.');
        
        // ... (اینجا می‌توانید بقیه مراحل اینستاگرام مانند Next و Share را از کدهای قبلی اضافه کنید) ...

        console.log('--- آپلود در اینستاگرام با موفقیت انجام شد ---');
    } catch(err) {
        console.error(`خطا در آپلود اینستاگرام: ${err.message}`);
        await page.screenshot({ path: path.join(__dirname, 'instagram_error.png') });
    }
}

// ============ تابع آپلود در تیک‌تاک ============
async function postToTiktok({ page, videoPath, caption, cookies }) {
    console.log('\n--- فرآیند آپلود در تیک‌تاک آغاز شد ---');
    try {
        if (!cookies || cookies.length === 0) throw new Error('کوکی‌های تیک‌تاک یافت نشد.');
        await page.setCookie(...cookies);
        console.log('کوکی‌های تیک‌تاک بارگذاری شدند.');

        await page.goto('https://www.tiktok.com/creator-center/upload?from=webapp', { waitUntil: 'networkidle2', timeout: 90000 });
        console.log('صفحه آپلود تیک‌تاک باز شد.');
        
        const uploadButtonSelector = 'button[data-e2e="select_video_button"]';
        await page.waitForSelector(uploadButtonSelector, { visible: true, timeout: 60000 });
        
        const [fileChooser] = await Promise.all([page.waitForFileChooser({timeout: 60000}), page.click(uploadButtonSelector)]);
        await fileChooser.accept([videoPath]);
        console.log('ویدیو برای تیک‌تاک انتخاب شد.');
        
        try {
            const closeButtonSelector = 'div > svg > path[d^="M38.7 12.12a"]';
            await page.waitForSelector(closeButtonSelector, { visible: true, timeout: 20000 });
            console.log("پاپ‌آپ تیک‌تاک یافت و بسته شد.");
            await page.click(closeButtonSelector);
        } catch (e) {
            console.log("پاپ‌آپ تیک‌تاک یافت نشد.");
        }
        
        console.log('منتظر آپلود ویدیو در تیک‌تاک (20 ثانیه)...');
        await delay(20000);

        const frame = await page.waitForFrame(async f => f.url().includes('tiktok.com/creator-center/upload'));
        if (!frame) throw new Error("Iframe تیک‌تاک پیدا نشد.");

        const captionXPath = "//*[@id=\"root\"]/div/div/div[2]/div[2]/div/div/div/div[4]/div[1]/div[2]/div[1]/div[2]/div[1]";
        await frame.waitForSelector(`xpath/${captionXPath}`);
        
        await frame.click(`xpath/${captionXPath}`);
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await frame.type(`xpath/${captionXPath}`, caption, { delay: 100 });
        console.log('کپشن در تیک‌تاک نوشته شد.');
        
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const postButtonXPath = "//*[@id='root']/div/div/div[2]/div[2]/div/div/div/div[5]/div/button[1]";
        await frame.waitForSelector(`xpath/${postButtonXPath}`);
        const [postButton] = await frame.$$(`xpath/${postButtonXPath}`);
        await postButton.click({ clickCount: 2 });
        console.log('روی دکمه Post تیک‌تاک کلیک شد.');
        
        await delay(5000);
        console.log('--- آپلود در تیک‌تاک به پایان رسید ---');
    } catch(err) {
        console.error(`خطا در آپلود تیک‌تاک: ${err.message}`);
        await page.screenshot({ path: path.join(__dirname, 'tiktok_error.png') });
    }
}

// ============ کنترلر اصلی ============
app.post('/upload', async (req, res) => {
    let { videoUrl, caption, instagramCookies, tiktokCookies } = req.body;
    if (!videoUrl || !caption) {
        return res.status(400).send("پارامترهای videoUrl و caption اجباری هستند.");
    }
    videoUrl = videoUrl.trim();
    res.status(202).send("درخواست آپلود برای هر دو پلتفرم دریافت شد.");

    (async () => {
        const tempDir = path.resolve(__dirname, TEMP_DIR_NAME);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
        const videoPath = path.join(tempDir, 'video.mp4');

        try {
            console.log('دانلود فایل مشترک...');
            await downloadFile(videoUrl, videoPath);
            console.log('دانلود با موفقیت انجام شد.');
        } catch(e) {
            console.error("دانلود فایل ناموفق بود. فرآیند متوقف شد.");
            return;
        }
        
        if (instagramCookies) {
            let browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
            let page = await browser.newPage();
            await postToInstagram({ page, videoPath, caption, cookies: instagramCookies });
            await browser.close();
        } else {
            console.log("کوکی‌های اینستاگرام ارسال نشده، از این مرحله عبور می‌کنیم.");
        }

        if (tiktokCookies) {
            let browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
            let page = await browser.newPage();
            await postToTiktok({ page, videoPath, caption, cookies: tiktokCookies });
            await browser.close();
        } else {
            console.log("کوکی‌های تیک‌تاک ارسال نشده، از این مرحله عبور می‌کنیم.");
        }
        
        console.log('*** تمام فرآیندهای آپلود به پایان رسید ***');
    })();
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`سرور با موفقیت بر روی پورت ${PORT} اجرا شد.`);
});
