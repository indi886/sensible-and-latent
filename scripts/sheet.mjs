// Tiles a capture folder into labelled contact sheets for review: node scripts/sheet.mjs <dir> <prefix> [cols] [w]
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
const [dir, prefix, colsArg, wArg] = process.argv.slice(2);
const C = Number(colsArg ?? 3), W = Number(wArg ?? 720);
const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const first = await sharp(`${dir}/${files[0]}`).metadata();
const H = Math.round(W * first.height / first.width);
let g = 0;
for (let i = 0; i < files.length; i += C * 3) {
  const grp = files.slice(i, i + C * 3);
  const rows = Math.ceil(grp.length / C);
  const tiles = await Promise.all(grp.map(async (f, k) => ({ input: await sharp(`${dir}/${f}`).resize(W, H).toBuffer(), left: (k % C) * W, top: Math.floor(k / C) * (H + 24) + 24 })));
  const labels = grp.map((f, k) => `<text x="${(k % C) * W + 6}" y="${Math.floor(k / C) * (H + 24) + 18}" fill="#ff0" font-size="16" font-family="Arial">${f}</text>`).join('');
  await sharp({ create: { width: W * C, height: rows * (H + 24), channels: 3, background: '#222' } })
    .composite([...tiles, { input: Buffer.from(`<svg width="${W * C}" height="${rows * (H + 24)}">${labels}</svg>`), left: 0, top: 0 }])
    .jpeg({ quality: 80 }).toFile(`${prefix}-${g++}.jpg`);
}
console.log('sheets', g);
