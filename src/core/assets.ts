// Every byte the first screen and the WebGL takes need. The preloader streams these with real byte
// progress and hands back object URLs, so nothing is fetched twice.
export const MEDIA = {
  reel720: '/media/video/reel-720.mp4',
  reel1080: '/media/video/reel-1080.mp4',
  poster: '/media/video/poster.webp',
  window: '/media/img/window.webp',
  galv: '/media/tex/galv.webp',
  copper: '/media/tex/copper.webp',
  services: ['/media/img/s-heatpump.webp', '/media/img/s-diagnose.webp', '/media/img/s-ducts.webp', '/media/img/s-air.webp', '/media/img/s-care.webp'],
  projects: ['/media/img/p-samhughes.webp', '/media/img/p-foothills.webp', '/media/img/p-barrio.webp', '/media/img/p-rooftop.webp', '/media/img/p-closet.webp', '/media/img/p-attic.webp'],
};

/** Critical set, with expected sizes (bytes) used until the response headers report the real ones. */
export function criticalAssets(): Array<{ url: string; est: number }> {
  return [
    { url: MEDIA.reel720, est: 4_800_000 },
    { url: MEDIA.window, est: 150_000 },
    { url: MEDIA.galv, est: 300_000 },
    { url: MEDIA.copper, est: 240_000 },
    ...MEDIA.services.map((url) => ({ url, est: 150_000 })),
    ...MEDIA.projects.map((url) => ({ url, est: 150_000 })),
  ];
}

const cache = new Map<string, string>();
export const cached = (url: string) => cache.get(url) ?? url;
export const putCache = (url: string, blobUrl: string) => cache.set(url, blobUrl);
export function releaseCache() {
  for (const u of cache.values()) URL.revokeObjectURL(u);
  cache.clear();
}
