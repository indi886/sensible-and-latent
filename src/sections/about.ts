// 02 · Two kinds of heat — rack focus. Three statements; the focal plane racks from the desert
// (sensible) to the droplets on the glass (latent) and settles between them for the company story.
import gsap from 'gsap';
import { GlassGL } from '../gl/glass';
import { stage } from '../core/scroll';
import { onTick } from '../core/loop';
import { cached, MEDIA } from '../core/assets';
import { lerp, range, fmt } from '../core/math';
import { reducedMotion } from '../core/env';
import { windowAlpha, show } from './window';
import { Disposer } from '../core/disposer';

export function createAbout() {
  const root = document.getElementById('about')!;
  const st = stage(root);
  const gl = new GlassGL(root.querySelector('canvas')!, st, cached(MEDIA.window));
  return {
    gl,
    init() {
      const d = new Disposer();
      const panes = Array.from(root.querySelectorAll<HTMLElement>('[data-about-pane]'));
      const sens = root.querySelector<HTMLElement>('[data-aw="sensible"]')!;
      const lat = root.querySelector<HTMLElement>('[data-aw="latent"]')!;
      const dist = root.querySelector<HTMLElement>('[data-focus-dist]')!;
      const counters = Array.from(root.querySelectorAll<HTMLElement>('[data-count]'));
      const bounds: Array<[number, number]> = [[0, 0.36], [0.36, 0.7], [0.7, 1]];
      let counted = false;
      d.add(onTick(() => {
        const p = st.progress;
        if (!st.inView) return;
        // focus keyframes: far (desert) → near (glass) → in between
        const focus = 1 - range(p, 0.27, 0.42) + range(p, 0.64, 0.78) * 0.55;
        gl.focus = focus;
        gl.drift = p;
        dist.textContent = fmt(lerp(0.42, 18, focus * focus), 2);
        panes.forEach((el, i) => show(el, windowAlpha(p, bounds[i][0], bounds[i][1], 0.06), 0, (1 - windowAlpha(p, bounds[i][0], bounds[i][1], 0.06)) * 18));
        // the two display words rack with the lens: one is always the one in focus
        const story = windowAlpha(p, bounds[2][0], bounds[2][1], 0.06);
        const sb = (1 - focus) * 16, lb = focus * 16;
        sens.style.filter = `blur(${sb.toFixed(1)}px)`;
        lat.style.filter = `blur(${lb.toFixed(1)}px)`;
        sens.style.opacity = ((0.25 + 0.75 * focus) * (1 - story * 0.7)).toFixed(3);
        lat.style.opacity = ((0.25 + 0.75 * (1 - focus)) * (1 - story * 0.7)).toFixed(3);
        sens.style.transform = `translate3d(${(-p * 6).toFixed(2)}vw, 0, 0) scale(${(1 + focus * 0.03).toFixed(3)})`;
        lat.style.transform = `translate3d(${(-p * 4).toFixed(2)}vw, 0, 0) scale(${(1 + (1 - focus) * 0.04).toFixed(3)})`;
        if (!counted && p > 0.74) {
          counted = true;
          for (const el of counters) {
            const end = Number(el.dataset.count), dec = Number(el.dataset.dec ?? 0);
            const o = { v: 0 };
            gsap.to(o, { v: end, duration: reducedMotion ? 0 : 1.6, ease: 'power3.out', onUpdate: () => { el.textContent = fmt(o.v, dec); } });
          }
        }
      }, 50));
      return { dispose: () => d.dispose() };
    },
  };
}
