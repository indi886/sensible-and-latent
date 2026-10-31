// 03 · IR survey — whip pan. Five services; the pointer is the thermal imager (on touch screens it
// sweeps by itself). The readout reports the temperature under the lens from the same heat the
// shader paints.
import { ImagerGL } from '../gl/imager';
import { stage, scroll } from '../core/scroll';
import { onTick } from '../core/loop';
import { cached, MEDIA } from '../core/assets';
import { damp, lerp, fmt } from '../core/math';
import { coarsePointer } from '../core/env';
import { pointer } from '../ui/cursor';
import { hudState } from '../ui/hud';
import { show, staircase } from './window';
import { Disposer } from '../core/disposer';

const SPANS: Array<[number, number]> = [[74, 182], [38, 66], [82, 150], [61, 83], [68, 114]];

export function createServices() {
  const root = document.getElementById('services')!;
  const st = stage(root);
  const gl = new ImagerGL(root.querySelector('canvas')!, st, MEDIA.services.map(cached));
  return {
    gl,
    init() {
      const d = new Disposer();
      const items = Array.from(root.querySelectorAll<HTMLElement>('[data-svc]'));
      const idx = root.querySelector<HTMLElement>('[data-svc-index]')!;
      const label = root.querySelector<HTMLElement>('[data-ir-spot-label]')!;
      const temp = root.querySelector<HTMLElement>('[data-ir-temp]')!;
      const stageEl = root.querySelector<HTMLElement>('.stage')!;
      let hovering = false;
      d.listen(stageEl, 'pointerenter', () => { hovering = true; });
      d.listen(stageEl, 'pointerleave', () => { hovering = false; });
      let lx = 0.64, ly = 0.52, lastI = -1, shownT = 0;
      d.add(onTick((dt, time) => {
        if (!st.inView) return;
        const S = staircase(st.progress, items.length, 0.32);
        gl.S = S;
        const i = Math.round(S);
        items.forEach((el, k) => {
          const a = Math.max(0, 1 - Math.abs(S - k) * 2.6);
          show(el, a, (k - S) * scroll.vw * 0.35, 0);
        });
        if (i !== lastI) { idx.textContent = String(i + 1).padStart(2, '0'); label.textContent = items[i].dataset.svcSpot ?? ''; lastI = i; }
        // lens follows the pointer, or sweeps a slow Lissajous on touch / when idle
        let tx: number, ty: number;
        if (!coarsePointer && hovering) { tx = pointer.x / scroll.vw; ty = 1 - pointer.y / scroll.vh; }
        else { tx = 0.62 + Math.sin(time * 0.45) * 0.2; ty = 0.55 + Math.sin(time * 0.71) * 0.16; }
        lx = damp(lx, tx, 9, dt);
        ly = damp(ly, ty, 9, dt);
        gl.lensPos.set(lx, ly);
        const h = gl.heatAt(lx, ly);
        const [lo, hi] = SPANS[i];
        const t = lerp(lo, hi, h);
        shownT = damp(shownT || t, t, 6, dt);
        temp.textContent = fmt(shownT, 1);
        hudState.spot = shownT;
      }, 50));
      return { dispose: () => d.dispose() };
    },
  };
}
