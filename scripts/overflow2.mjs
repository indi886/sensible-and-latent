import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://127.0.0.1:5211/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__SL?.ready && window.__SL.introDone(), { timeout: 60000 });
const res = await page.evaluate(async () => {
  const out = {};
  const sels = ['.grain', '.hud', '.letterbox', '.cursor', '.nav', '#hero', '#about', '#services', '#process', '#projects', '#testimonials', '#team', '#faq', '#contact', '.cut-pulse'];
  for (const s of sels) {
    const el = document.querySelector(s); const prev = el.style.display; el.style.display = 'none';
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    out[s] = document.documentElement.scrollWidth + '/' + innerWidth;
    el.style.display = prev;
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
