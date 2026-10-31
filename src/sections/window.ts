// Helpers for scroll-scrubbed copy inside sticky stages: each block owns a window of the progress
// value; adjacent windows hand over at a shared boundary (one fades out before the next fades in),
// so text never overlaps during a crossfade.
import { clamp, smooth } from '../core/math';

/** alpha for a block shown on [a, b] with fade length f at each end */
export function windowAlpha(p: number, a: number, b: number, f: number) {
  const inA = a <= 0 ? 1 : smooth(clamp((p - a) / f));
  const outA = b >= 1 ? 1 : 1 - smooth(clamp((p - (b - f)) / f));
  return inA * outA;
}

/** apply alpha + a small travel to a block; hides it from AT and hit-testing when gone */
export function show(el: HTMLElement, alpha: number, dx = 0, dy = 0) {
  el.style.opacity = alpha.toFixed(3);
  el.style.transform = dx || dy ? `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)` : '';
  const vis = alpha > 0.01;
  if (vis !== (el.style.visibility === 'visible')) el.style.visibility = vis ? 'visible' : 'hidden';
}

/** staircase: dwell on each integer, move to the next during the last `move` fraction of its slot */
export function staircase(p: number, count: number, move = 0.4) {
  const q = clamp(p) * count;
  const i = Math.min(count - 1, Math.floor(q));
  const f = q - i;
  if (i >= count - 1) return count - 1;
  return i + smooth(clamp((f - (1 - move)) / move));
}
