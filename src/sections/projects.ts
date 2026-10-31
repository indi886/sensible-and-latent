// 05 · Damper bank — tilt-up. Scroll is the actuator: each project holds while its blades are shut,
// then the bank flips in an opposed ripple to the next.
import { DamperGL } from '../gl/damper';
import { stage } from '../core/scroll';
import { onTick } from '../core/loop';
import { cached, MEDIA } from '../core/assets';
import { fmt } from '../core/math';
import { pointer } from '../ui/cursor';
import { hudState } from '../ui/hud';
import { show, staircase } from './window';
import { Disposer } from '../core/disposer';

export function createProjects() {
  const root = document.getElementById('projects')!;
  const st = stage(root);
  const gl = new DamperGL(root.querySelector('canvas')!, st, MEDIA.projects.map(cached), cached(MEDIA.galv));
  return {
    gl,
    init() {
      const d = new Disposer();
      const items = Array.from(root.querySelectorAll<HTMLElement>('[data-proj]'));
      const pos = root.querySelector<HTMLElement>('[data-damper-pos]')!;
      const cfm = root.querySelector<HTMLElement>('[data-damper-cfm]')!;
      let last = '';
      d.add(onTick(() => {
        if (!st.inView) return;
        const p = st.progress;
        const P = staircase(Math.min(1, p * 1.04), items.length, 0.42);
        gl.P = P;
        gl.tilt = p;
        gl.pointer.set(pointer.nx, pointer.ny);
        items.forEach((el, k) => {
          const a = Math.max(0, 1 - Math.abs(P - k) * 2.8);
          show(el, a, 0, (k - P) * 40);
        });
        const open = gl.opening;
        const s = `${Math.round(open * 100)}|${Math.round(open * 2400 / 10) * 10}`;
        if (s !== last) { pos.textContent = String(Math.round(open * 100)); cfm.textContent = fmt(Math.round(open * 2400 / 10) * 10); last = s; }
        hudState.spot = 57.2 + open * 4;
      }, 50));
      return { dispose: () => d.dispose() };
    },
  };
}
