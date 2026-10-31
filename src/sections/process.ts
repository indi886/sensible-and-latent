// 04 · The install — walkaround. Maps scroll to the build value, shows one step at a time, pins the
// spec callouts to their 3D anchors, and keeps the live readings and the install clock in step.
import * as THREE from 'three';
import { ProcessGL, STAGES, CALLOUTS } from '../gl/process';
import { stage, scroll } from '../core/scroll';
import { onTick } from '../core/loop';
import { clamp, invLerp, fmt, lerp } from '../core/math';
import { pointer } from '../ui/cursor';
import { hudState } from '../ui/hud';
import { windowAlpha, show } from './window';
import { Disposer } from '../core/disposer';

/** install clock per stage: [day, start minute, end minute] */
const CLOCK: Array<[number, number, number]> = [
  [0, 11 * 60, 12 * 60 + 30], [0, 13 * 60, 14 * 60 + 40], [1, 10 * 60, 13 * 60 + 10], [1, 13 * 60 + 20, 14 * 60 + 5],
  [1, 14 * 60 + 10, 15 * 60 + 40], [1, 15 * 60 + 45, 17 * 60 + 5], [2, 17 * 60 + 10, 18 * 60 + 20], [2, 18 * 60 + 20, 19 * 60 + 35],
];
const SPOT = [118.4, 104, 141, 96, 98.2, 88.4, 61.0, 54.8];

export function createProcess() {
  const root = document.getElementById('process')!;
  const st = stage(root);
  const gl = new ProcessGL(root.querySelector('canvas')!, st);
  return {
    gl,
    init() {
      const d = new Disposer();
      const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-step]'));
      const layer = root.querySelector<HTMLElement>('[data-callouts]')!;
      const q = (s: string) => root.querySelector<HTMLElement>(s)!;
      const out = {
        stage: q('[data-pl-stage]'), ducts: q('[data-pl-ducts]'), total: q('[data-pl-ducts-total]'), joints: q('[data-pl-joints]'),
        psig: q('[data-pl-psig]'), vac: q('[data-pl-vac]'), supply: q('[data-pl-supply]'), ret: q('[data-pl-return]'), load: q('[data-pl-load]'),
        day: q('[data-proc-day]'), time: q('[data-proc-time]'), rail: q('[data-proc-rail]'),
      };
      out.total.textContent = String(gl.ductEnds.length);

      // callouts: a dot on the anchor, a leader, a label box
      const callouts = CALLOUTS.map((c) => {
        const el = document.createElement('div');
        el.className = 'callout';
        el.style.color = c.stage >= 6 ? '#63B3E8' : c.stage === 0 ? '#F2A33A' : '#EAF1F3';
        el.innerHTML = `<i class="callout-dot"></i><i class="callout-line"></i><p class="callout-box"><b>${c.title}</b><span>${c.detail}</span></p>`;
        layer.appendChild(el);
        return { c, el, flip: false };
      });
      const v = new THREE.Vector3();
      const cache = new Map<HTMLElement, string>();
      const set = (el: HTMLElement, s: string) => { if (cache.get(el) !== s) { el.textContent = s; cache.set(el, s); } };

      d.add(onTick(() => {
        if (!st.inView) return;
        const P = clamp((st.progress - 0.015) / 0.97);
        gl.P = P;
        gl.pointer.set(pointer.nx, pointer.ny);
        const si = ProcessGL.stageAt(P);
        steps.forEach((el, i) => {
          const a = windowAlpha(P, i === 0 ? -1 : STAGES[i], i === 7 ? 2 : STAGES[i + 1], 0.012);
          show(el, a, 0, (1 - a) * 14);
        });
        // live readings
        const r = gl.readings();
        set(out.stage, String(r.stageNo).padStart(2, '0'));
        set(out.ducts, String(r.ducts));
        set(out.joints, String(r.joints));
        set(out.psig, fmt(r.psig));
        set(out.vac, r.vac === null ? '—' : fmt(r.vac));
        set(out.supply, r.supply === null ? '—' : fmt(r.supply, 1));
        set(out.ret, fmt(r.ret, 1));
        set(out.load, fmt(Math.round(r.load / 100) * 100));
        const [day, m0, m1] = CLOCK[si];
        const m = Math.round(lerp(m0, m1, invLerp(STAGES[si], STAGES[si + 1], P)));
        set(out.day, `Day ${day}`);
        set(out.time, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
        out.rail.style.transform = `scaleX(${P.toFixed(4)})`;
        hudState.spot = SPOT[si];

        // pin callouts to their anchors
        const cam = gl.camera;
        const w = scroll.vw, h = scroll.vh;
        for (const co of callouts) {
          const f = invLerp(STAGES[co.c.stage], STAGES[co.c.stage + 1], P);
          const on = co.c.stage === si ? Math.min(1, invLerp(0.1, 0.24, f), 1 - invLerp(0.86, 0.97, f)) : 0;
          if (on <= 0.001) { if (co.el.style.opacity !== '0') co.el.style.opacity = '0'; continue; }
          v.copy(co.c.pos).project(cam);
          if (v.z > 1) { co.el.style.opacity = '0'; continue; }
          const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
          const flip = x > w * (w < 700 ? 0.42 : 0.58);
          if (flip !== co.flip) { co.el.classList.toggle('flip', flip); co.flip = flip; }
          co.el.style.opacity = on.toFixed(3);
          co.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          (co.el.children[1] as HTMLElement).style.transform = `scaleX(${(flip ? -1 : 1) * on})`;
        }
      }, 50));
      return { dispose: () => d.dispose() };
    },
  };
}
