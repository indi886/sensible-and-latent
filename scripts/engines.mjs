// Cross-engine smoke test with Playwright's WebKit (Safari's engine) and Firefox builds: load the
// production preview, wait for the preloader to clear, scroll through every take, record console
// errors and page errors, and capture one frame per take. Not a substitute for real Safari on iOS.
//   node scripts/engines.mjs [url] [outDir]
import { webkit, firefox } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://127.0.0.1:4211/';
const OUT = process.argv[3] ?? 'shots/engines';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [name, engine] of [['webkit', webkit], ['firefox', firefox]]) {
  mkdirSync(`${OUT}/${name}`, { recursive: true });
  let browser;
  try {
    browser = await engine.launch({ headless: true });
  } catch (err) {
    console.log(name, 'could not launch:', String(err).split('\n')[0]);
    continue;
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const issues = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') issues.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => issues.push(`[pageerror] ${e.message}`));
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  let ready = -1;
  try {
    await page.waitForFunction(() => !document.getElementById('preloader') && document.body.classList.contains('is-live'), null, { timeout: 90000 });
    ready = Date.now() - t0;
  } catch { issues.push('[timeout] preloader never cleared'); }
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    return c ? (c.getParameter(c.RENDERER) + ' / ' + c.getParameter(c.VERSION)) : 'no webgl2';
  });
  await sleep(3500);
  await page.screenshot({ path: `${OUT}/${name}/00-hero.png` });
  const ids = ['about', 'services', 'process', 'projects', 'testimonials', 'team', 'faq', 'contact'];
  for (const [i, id] of ids.entries()) {
    await page.evaluate((sel) => {
      const el = document.getElementById(sel);
      const y = el.getBoundingClientRect().top + scrollY + Math.max(0, (el.offsetHeight - innerHeight) * 0.45);
      window.scrollTo(0, y);
    }, id);
    await sleep(1800);
    await page.screenshot({ path: `${OUT}/${name}/${String(i + 1).padStart(2, '0')}-${id}.png` });
  }
  const ready3d = await page.evaluate(() => Array.from(document.querySelectorAll('canvas.gl')).map((c) => c.classList.contains('is-ready')));
  console.log(`${name}: ready ${ready} ms · ${gl} · canvases ready ${JSON.stringify(ready3d)} · ${issues.length} issues`);
  const kinds = {};
  for (const i of issues) { const k = i.replace(/TEXTURE_[A-Z_]+|level \d+|0x[0-9a-f]+/g, '*').slice(0, 160); kinds[k] = (kinds[k] ?? 0) + 1; }
  for (const [k, n] of Object.entries(kinds)) console.log('   ', n, '×', k);
  await browser.close();
}
