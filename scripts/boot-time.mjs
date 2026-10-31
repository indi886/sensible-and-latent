// Measures preload and per-scene shader warm-up times in headless Chrome (dev server).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const t0 = Date.now();
await page.goto(process.argv[2] ?? 'http://127.0.0.1:5211/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__allWarm, { timeout: 90000 });
console.log('wall', Date.now() - t0, 'ms', JSON.stringify(await page.evaluate(() => [window.__bootTimes, window.__allWarm])));
await browser.close();
