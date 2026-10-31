// Environment flags read once at boot.
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarsePointer = matchMedia('(pointer: coarse)').matches;
export const isNarrow = () => innerWidth < 760;
export const dprCap = () => Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.75 : 2);
