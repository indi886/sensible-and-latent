// Headless verification. The in-app browser pane throttles rAF below 1 fps, so this drives the
// installed Chrome headless with the GPU on, at 1440×900 and 390×844, jumps to exact scroll states
// through the dev-only hooks (window.__SL), waits for animation states, and captures every take.
//
//   node scripts/shoot.mjs [url] [outDir] [--only=hero,process] [--vp=desktop|mobile] [--fps]
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const pos = args.filter((a) => !a.startsWith('--'));
const URL = pos[0] ?? 'http://127.0.0.1:5211/';
const OUT = pos[1] ?? 'shots/pass';
const ONLY = flags.only ? String(flags.only).split(',') : null;
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// process stage midpoints (build value P) → stage progress p = 0.015 + P * 0.97
const STAGES = [0, 0.11, 0.21, 0.42, 0.52, 0.63, 0.73, 0.84, 1.0];
const proc = STAGES.slice(0, -1).map((s, i) => 0.015 + ((s + STAGES[i + 1]) / 2) * 0.97);

const PLAN = {
  hero: [0, 0.3, 0.55, 0.7, 0.8, 0.95],
  about: [0.12, 0.5, 0.86],
  services: [0.08, 0.27, 0.48, 0.92],
  process: [...proc, 0.46 * 0.97, 0.995],
  projects: [0.04, 0.13, 0.3, 0.55, 0.98],
  testimonials: [0.14, 0.27, 0.62, 0.95],
  team: [0.15, 0.55],
  faq: [0.0, 0.45],
  contact: [0.2, 0.42, 0.66, 0.85, 1.0],
};

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
].filter((v) => !flags.vp || v.name === flags.vp);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-webgl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
});

const report = { url: URL, when: new Date().toISOString(), viewports: {} };
for (const vp of VIEWPORTS) {
  const dir = `${OUT}/${vp.name}`;
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport(vp);
  if (vp.isMobile) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  // preloader mid-flight
  await sleep(700);
  await page.screenshot({ path: `${dir}/00-preloader.png` });
  await page.waitForFunction(() => !document.getElementById('preloader') && window.__SL?.ready, { timeout: 60000 });
  const tReady = Date.now() - t0;
  // intro beats: just after the preloader clears, mid-intro, settled
  await sleep(250);
  await page.screenshot({ path: `${dir}/01-hero-intro-a.png` });
  await sleep(1300);
  await page.screenshot({ path: `${dir}/01-hero-intro-b.png` });
  await page.waitForFunction(() => window.__SL.introDone(), { timeout: 20000 });
  await sleep(400);
  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const ext = c?.getExtension('WEBGL_debug_renderer_info');
    return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  const stats = {};
  let n = 2;
  for (const [id, list] of Object.entries(PLAN)) {
    if (ONLY && !ONLY.includes(id)) continue;
    for (const p of list) {
      await page.evaluate((i, q) => window.__SL.goto(i, q), id, p);
      await sleep(id === 'projects' ? 1600 : id === 'process' ? 900 : 700);
      const name = `${String(n++).padStart(2, '0')}-${id}-${p.toFixed(3)}`;
      await page.screenshot({ path: `${dir}/${name}.png` });
    }
    if (flags.fps && ['hero', 'process', 'projects', 'services', 'about'].includes(id)) {
      await page.evaluate((i, q) => window.__SL.goto(i, q), id, list[Math.floor(list.length / 2)]);
      await sleep(400);
      stats[id] = await page.evaluate(() => window.__SL.frameStats(2500));
    }
  }
  report.viewports[vp.name] = { readyMs: tReady, gpu, errors, frameStats: stats };
  console.log(vp.name, 'ready in', tReady, 'ms ·', gpu, '·', errors.length, 'console issues', flags.fps ? JSON.stringify(stats) : '');
  for (const e of errors.slice(0, 12)) console.log('   ', e.slice(0, 300));
  await page.close();
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await browser.close();
