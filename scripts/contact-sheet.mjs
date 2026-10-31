// Builds a contact sheet of every generated still so the set can be judged for grade consistency.
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2] ?? 'assets-src/stills';
const out = process.argv[3] ?? 'assets-src/contact.jpg';
const files = readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
const W = 400, H = 280, COLS = 6;
const rows = Math.ceil(files.length / COLS);
const tiles = await Promise.all(files.map(async (f, i) => ({
  input: await sharp(join(dir, f)).resize(W, H - 20, { fit: 'contain', background: '#111' }).toBuffer(),
  left: (i % COLS) * W, top: Math.floor(i / COLS) * H,
})));
const labels = files.map((f, i) => `<text x="${(i % COLS) * W + 6}" y="${Math.floor(i / COLS) * H + H - 5}" fill="#ccc" font-size="14" font-family="Arial">${f}</text>`).join('');
await sharp({ create: { width: W * COLS, height: H * rows, channels: 3, background: '#111' } })
  .composite([...tiles, { input: Buffer.from(`<svg width="${W * COLS}" height="${H * rows}">${labels}</svg>`), left: 0, top: 0 }])
  .jpeg({ quality: 82 }).toFile(out);
console.log('wrote', out, files.length);
