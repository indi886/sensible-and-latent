// 08 · Troubleshooting — crane down. The trunk line is drawn down the page with scroll, each symptom
// branches off as the camera passes it, and opening a node expands its answer (grid-template-rows).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { reducedMotion } from '../core/env';
import { Disposer } from '../core/disposer';

export function initFaq() {
  const root = document.getElementById('faq')!;
  const d = new Disposer();
  const trunk = root.querySelector<HTMLElement>('[data-trunk]')!;
  const tree = root.querySelector<HTMLElement>('.tree')!;
  const head = root.querySelector<HTMLElement>('.faq-head')!;
  const triggers: ScrollTrigger[] = [];
  triggers.push(ScrollTrigger.create({
    trigger: tree, start: 'top 78%', end: 'bottom 65%', scrub: reducedMotion ? true : 0.6,
    onUpdate: (s) => { trunk.style.transform = `scaleY(${s.progress.toFixed(4)})`; },
  }));
  // the crane: the heading sinks slower than the page as the camera descends past it
  triggers.push(ScrollTrigger.create({
    trigger: root, start: 'top bottom', end: 'top top', scrub: true,
    onUpdate: (s) => { head.style.transform = `translate3d(0, ${((1 - s.progress) * -60).toFixed(1)}px, 0)`; },
  }));
  for (const node of root.querySelectorAll<HTMLElement>('[data-node]')) {
    const branch = node.querySelector<HTMLElement>('.node-branch')!;
    const btn = node.querySelector<HTMLButtonElement>('.node-q')!;
    const text = node.querySelector<HTMLElement>('.node-text')!;
    gsap.set(text, { opacity: 0, x: -20 });
    triggers.push(ScrollTrigger.create({
      trigger: node, start: 'top 80%',
      onEnter: () => {
        gsap.to(branch, { scaleX: 1, duration: reducedMotion ? 0 : 0.5, ease: 'power3.out' });
        gsap.to(text, { opacity: 1, x: 0, duration: reducedMotion ? 0 : 0.7, ease: 'expo.out', delay: 0.15 });
      },
      onLeaveBack: () => { gsap.to(branch, { scaleX: 0, duration: 0.3 }); gsap.to(text, { opacity: 0, x: -20, duration: 0.3 }); },
    }));
    d.listen(btn, 'click', () => {
      const open = !node.classList.contains('is-open');
      node.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      // let ScrollTrigger re-measure once the answer has opened
      setTimeout(() => ScrollTrigger.refresh(), 650);
    });
  }
  return { dispose: () => { triggers.forEach((t) => t.kill()); d.dispose(); } };
}
