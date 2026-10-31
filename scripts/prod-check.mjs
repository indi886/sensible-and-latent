// Production check (no dev hooks in the bundle): load the preview build, wait for the preloader to
// clear, scroll through the page with native scrolling, log console errors and capture a few frames,
// once normally and once with prefers-reduced-motion: reduce.
//   node scripts/prod-check.mjs [url] [outDir]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://127.0.0.1:4211/';
const OUT = process.argv[3] ?? 'shots/prod';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });

for (const reduced of [false, true]) {
  const tag = reduced ? 'reduced' : 'normal';
  mkdirSync(`${OUT}/${tag}`, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('preloader') && document.body.classList.contains('is-live'), { timeout: 60000 });
  const ready = Date.now() - t0;
  await sleep(reduced ? 300 : 4500);
  await page.screenshot({ path: `${OUT}/${tag}/00-hero.png` });
  const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const fracs = [0.03, 0.12, 0.25, 0.4, 0.55, 0.66, 0.78, 0.9, 1.0];
  for (const [i, f] of fracs.entries()) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(H * f));
    await sleep(1600);
    await page.screenshot({ path: `${OUT}/${tag}/${String(i + 1).padStart(2, '0')}-${f.toFixed(2)}.png` });
  }
  console.log(tag, 'ready', ready, 'ms ·', errors.length, 'console issues');
  for (const e of errors.slice(0, 10)) console.log('   ', e.slice(0, 240));
  await page.close();
}
await browser.close();
