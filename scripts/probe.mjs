// Re-captures a few exact states of one take to chase a rendering fault: node scripts/probe.mjs <id> <p,p,...> [out]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const [id, list, out = 'shots/probe'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
await page.goto('http://127.0.0.1:5211/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__SL?.ready && window.__SL.introDone(), { timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000)); // let the background scenes finish compiling
for (const p of list.split(',').map(Number)) {
  await page.evaluate((i, q) => window.__SL.goto(i, q), id, p);
  for (let k = 0; k < 3; k++) {
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: `${out}/${id}-${p.toFixed(3)}-${k}.png` });
  }
}
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n') || 'no console issues');
await browser.close();
