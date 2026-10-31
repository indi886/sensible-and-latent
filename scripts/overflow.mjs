// Finds elements that stick out past the viewport at 390 px wide (horizontal-overflow audit).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(process.argv[2] ?? 'http://127.0.0.1:5211/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__SL?.ready && window.__SL.introDone(), { timeout: 60000 });
for (const [id, p] of [['hero', 0], ['services', 0.1], ['team', 0.1], ['faq', 0.2]]) {
  await page.evaluate((i, q) => window.__SL.goto(i, q), id, p);
  await new Promise((r) => setTimeout(r, 600));
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.right > vw + 1 && getComputedStyle(el).position !== 'fixed') out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} right=${Math.round(b.right)}`);
    }
    const nav = document.querySelector('.nav-cta').getBoundingClientRect();
    return { vw, scrollW: document.documentElement.scrollWidth, innerW: innerWidth, vv: visualViewport.width, navRight: Math.round(nav.right), out: out.slice(0, 12) };
  });
  console.log(id, JSON.stringify(r));
}
await browser.close();
