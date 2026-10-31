// Cursor: a thermal-imager reticle. Four corner brackets around a spot; over anything clickable the
// brackets lock to the element's bounds. The readout is the take's spot temperature.
import { onTick } from '../core/loop';
import { damp } from '../core/math';
import { coarsePointer, reducedMotion } from '../core/env';
import { hudState } from './hud';
import { Disposer } from '../core/disposer';

const LOCKABLE = '[data-cursor], a, button, label.chip, input, textarea';

export const pointer = { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0, active: false };

export function initCursor() {
  const d = new Disposer();
  d.listen(window, 'pointermove', (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.nx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ny = -((e.clientY / innerHeight) * 2 - 1);
    pointer.active = true;
  }, { passive: true });
  if (coarsePointer) return () => d.dispose();

  const root = document.querySelector<HTMLElement>('.cursor')!;
  const corners = Array.from(root.querySelectorAll<HTMLElement>('.cursor-ring i'));
  const dot = root.querySelector<HTMLElement>('.cursor-dot')!;
  const read = root.querySelector<HTMLElement>('.cursor-read')!;
  const temp = root.querySelector<HTMLElement>('[data-cursor-temp]')!;
  document.body.classList.add('has-cursor');

  let target: HTMLElement | null = null;
  d.listen(document, 'pointerover', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>(LOCKABLE);
    target = t;
  });
  d.listen(document, 'pointerleave', () => { target = null; });

  // corner state: x,y for each of the four brackets
  const cs = corners.map(() => ({ x: pointer.x, y: pointer.y }));
  const k = reducedMotion ? 60 : 18;
  let lastT = '';
  d.add(onTick((dt) => {
    let box: [number, number, number, number];
    if (target && target.isConnected) {
      const r = target.getBoundingClientRect();
      const pad = 5;
      box = [r.left - pad, r.top - pad, r.right + pad, r.bottom + pad];
    } else {
      box = [pointer.x - 11, pointer.y - 11, pointer.x + 11, pointer.y + 11];
    }
    const goals = [[box[0], box[1]], [box[2] - 8, box[1]], [box[0], box[3] - 8], [box[2] - 8, box[3] - 8]];
    for (let i = 0; i < 4; i++) {
      cs[i].x = damp(cs[i].x, goals[i][0], k, dt);
      cs[i].y = damp(cs[i].y, goals[i][1], k, dt);
      corners[i].style.transform = `translate3d(${cs[i].x.toFixed(1)}px, ${cs[i].y.toFixed(1)}px, 0)`;
    }
    dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
    read.style.transform = `translate3d(${(target ? box[2] + 6 : pointer.x + 16).toFixed(1)}px, ${(target ? box[1] - 2 : pointer.y + 10).toFixed(1)}px, 0)`;
    const t = (hudState.spot + (pointer.nx * 1.3 - pointer.ny * 0.8)).toFixed(1);
    if (t !== lastT) { temp.textContent = t; lastT = t; }
  }, 92));

  return () => { d.dispose(); document.body.classList.remove('has-cursor'); };
}
