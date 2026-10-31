// Magnetic controls and magnetic text. Buttons lean toward the pointer and their label leans further;
// display letters near the pointer align toward it like air drawn to a return grille. Transforms only
// (the individual `translate` property, so it composes with any GSAP transform on the same glyph).
import gsap from 'gsap';
import { onTick } from '../core/loop';
import { pointer } from './cursor';
import { splitChars } from './split';
import { coarsePointer, reducedMotion } from '../core/env';
import { Disposer } from '../core/disposer';

export function initMagnetic() {
  const d = new Disposer();
  if (coarsePointer || reducedMotion) return () => d.dispose();

  for (const el of document.querySelectorAll<HTMLElement>('[data-magnetic]')) {
    const inner = el.querySelector<HTMLElement>('span') ?? el;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    const ixTo = gsap.quickTo(inner, 'x', { duration: 0.6, ease: 'power3.out' });
    const iyTo = gsap.quickTo(inner, 'y', { duration: 0.6, ease: 'power3.out' });
    d.listen(el, 'pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      xTo(dx * 0.32); yTo(dy * 0.42); ixTo(dx * 0.16); iyTo(dy * 0.2);
    });
    d.listen(el, 'pointerleave', () => { xTo(0); yTo(0); ixTo(0); iyTo(0); });
  }

  type Glyph = { el: HTMLSpanElement; x: number; y: number };
  const groups: Array<{ host: HTMLElement; glyphs: Glyph[]; visible: boolean }> = [];
  for (const host of document.querySelectorAll<HTMLElement>('[data-magnetic-text]')) {
    const chars = host.querySelectorAll('.ch').length ? Array.from(host.querySelectorAll<HTMLSpanElement>('.ch')) : splitChars(host, 'mt');
    groups.push({ host, glyphs: chars.map((el) => ({ el, x: 0, y: 0 })), visible: false });
  }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const g = groups.find((x) => x.host === en.target);
      if (g) g.visible = en.isIntersecting;
    }
  });
  groups.forEach((g) => io.observe(g.host));
  d.add(() => io.disconnect());

  const R = 190;
  d.add(onTick((dt) => {
    const a = 1 - Math.exp(-dt * 10);
    for (const g of groups) {
      if (!g.visible) continue;
      for (const gl of g.glyphs) {
        const r = gl.el.getBoundingClientRect();
        const cx = r.left + r.width / 2 - gl.x;
        const cy = r.top + r.height / 2 - gl.y;
        const dx = pointer.x - cx, dy = pointer.y - cy;
        const dist = Math.hypot(dx, dy);
        const f = pointer.active && dist < R ? Math.pow(1 - dist / R, 2) : 0;
        const tx = dx * 0.09 * f, ty = dy * 0.12 * f;
        gl.x += (tx - gl.x) * a;
        gl.y += (ty - gl.y) * a;
        if (Math.abs(gl.x) < 0.01 && Math.abs(gl.y) < 0.01 && f === 0) { if (gl.el.style.translate) gl.el.style.translate = ''; continue; }
        gl.el.style.translate = `${gl.x.toFixed(2)}px ${gl.y.toFixed(2)}px`;
      }
    }
  }, 60));

  return () => d.dispose();
}
