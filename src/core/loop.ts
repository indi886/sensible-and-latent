// The only animation clock. One GSAP ticker callback drives Lenis, every stage, every WebGL scene
// and the HUD, in a fixed order, so nothing reads scroll before it has been advanced this frame.
import gsap from 'gsap';

export type Tick = (dt: number, time: number) => void;
type Sub = { fn: Tick; order: number };

const subs: Sub[] = [];
let started = false;

function master(time: number, deltaMs: number) {
  const dt = Math.min(deltaMs / 1000, 0.1);
  for (let i = 0; i < subs.length; i++) subs[i].fn(dt, time);
}

export function startLoop() {
  if (started) return;
  started = true;
  gsap.ticker.lagSmoothing(0);
  gsap.ticker.add(master);
}

export function stopLoop() {
  gsap.ticker.remove(master);
  started = false;
}

/** order: 0 scroll · 10 stages/themes · 50 sections · 80 WebGL · 90 HUD/cursor. Returns a disposer. */
export function onTick(fn: Tick, order = 50): () => void {
  const sub = { fn, order };
  subs.push(sub);
  subs.sort((a, b) => a.order - b.order);
  return () => {
    const i = subs.indexOf(sub);
    if (i >= 0) subs.splice(i, 1);
  };
}
