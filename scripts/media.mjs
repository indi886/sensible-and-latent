// Converts the original generations in assets-src/ into the web set in public/media/.
// Reproducible: run `npm run media` after replacing any source still.
//   stills  → WebP, sized per role (full-bleed 1920, plates 1600, portraits 900, textures 1024)
//   sources stay in assets-src/ (not shipped)
import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';

const SRC = 'assets-src/stills';
const IMG = 'public/media/img';
const TEX = 'public/media/tex';
mkdirSync(IMG, { recursive: true });
mkdirSync(TEX, { recursive: true });

/** [source, output, width, quality] */
const jobs = [
  ['k1-coil.png', `${IMG}/coil.webp`, 1920, 80],
  ['k5-diffuser.png', `${IMG}/diffuser.webp`, 1920, 80],
  ['about-window.jpg', `${IMG}/window.webp`, 1920, 80],
  ['p1-samhughes.jpg', `${IMG}/p-samhughes.webp`, 1600, 80],
  ['p2-foothills.jpg', `${IMG}/p-foothills.webp`, 1600, 80],
  ['p3-barrio.jpg', `${IMG}/p-barrio.webp`, 1600, 80],
  ['p4-rooftop.jpg', `${IMG}/p-rooftop.webp`, 1600, 80],
  ['p5-closet.jpg', `${IMG}/p-closet.webp`, 1600, 80],
  ['p6-attic.jpg', `${IMG}/p-attic.webp`, 1600, 80],
  ['s1-install.jpg', `${IMG}/s-heatpump.webp`, 1920, 78],
  ['s2-diagnose.jpg', `${IMG}/s-diagnose.webp`, 1920, 78],
  ['s3-mastic.jpg', `${IMG}/s-ducts.webp`, 1920, 78],
  ['s4-filter.jpg', `${IMG}/s-air.webp`, 1920, 78],
  ['s5-coilclean.jpg', `${IMG}/s-care.webp`, 1920, 78],
  ['team-marisol.jpg', `${IMG}/t-marisol.webp`, 900, 80],
  ['team-dayo.jpg', `${IMG}/t-dayo.webp`, 900, 80],
  ['team-hollis.jpg', `${IMG}/t-hollis.webp`, 900, 80],
  ['team-priya.jpg', `${IMG}/t-priya.webp`, 900, 80],
  ['t-galv.jpg', `${TEX}/galv.webp`, 1024, 82],
  ['t-copper.jpg', `${TEX}/copper.webp`, 1024, 82],
  ['t-armaflex.jpg', `${TEX}/armaflex.webp`, 1024, 82],
];

for (const [src, out, width, quality] of jobs) {
  const path = `${SRC}/${src}`;
  if (!existsSync(path)) { console.warn('missing', path); continue; }
  const info = await sharp(path).resize({ width, withoutEnlargement: true }).webp({ quality, effort: 5 }).toFile(out);
  console.log(out.padEnd(36), `${info.width}×${info.height}`, `${(info.size / 1024).toFixed(0)} KB`);
}
