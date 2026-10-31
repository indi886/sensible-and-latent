// Live film grain. Generated once into a small tile and stepped by a CSS transform animation, so it
// costs no per-frame scripting and is never baked into the video.
export function initGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = 220;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(220, 220);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 120;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--grain-url', `url(${c.toDataURL('image/png')})`);
}
