// Lenis inertial scroll bridged to ScrollTrigger, plus the sticky-stage registry.
// A stage is a tall section with a `position: sticky` child; its progress is one scalar (0→1),
// computed every frame from the scroll position against cached offsets, so it scrubs both ways
// without pin spacers.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { onTick } from './loop';
import { clamp } from './math';
import { reducedMotion } from './env';

gsap.registerPlugin(ScrollTrigger);

export const scroll = { y: 0, velocity: 0, vh: innerHeight, vw: innerWidth, docH: 1 };
export let lenis: Lenis | null = null;

export class Stage {
  top = 0;
  height = 1;
  progress = 0;
  /** any part of the section intersects the viewport */
  inView = false;
  constructor(public el: HTMLElement) { this.measure(); }
  measure() {
    const r = this.el.getBoundingClientRect();
    this.top = r.top + (lenis ? lenis.scroll : scrollY);
    this.height = this.el.offsetHeight;
  }
  update(y: number, vh: number) {
    this.progress = clamp((y - this.top) / Math.max(1, this.height - vh));
    this.inView = y + vh > this.top && y < this.top + this.height;
  }
}

const stages: Stage[] = [];
export function stage(el: HTMLElement) {
  const s = new Stage(el);
  stages.push(s);
  return s;
}

export function measureStages() {
  scroll.vh = innerHeight;
  scroll.vw = innerWidth;
  scroll.docH = document.documentElement.scrollHeight;
  for (const s of stages) s.measure();
}

let resizeTimer = 0;

export function initScroll() {
  lenis = new Lenis({ autoRaf: false, lerp: reducedMotion ? 1 : 0.1, smoothWheel: !reducedMotion, wheelMultiplier: 0.9 });
  lenis.on('scroll', ScrollTrigger.update);
  lenis.stop();
  const offTick = onTick((_dt, time) => {
    lenis!.raf(time * 1000);
    scroll.y = lenis!.scroll;
    scroll.velocity = lenis!.velocity;
    for (const s of stages) s.update(scroll.y, scroll.vh);
  }, 0);
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { measureStages(); ScrollTrigger.refresh(); }, 120);
  };
  addEventListener('resize', onResize);
  const ro = new ResizeObserver(onResize);
  ro.observe(document.body);
  return () => {
    removeEventListener('resize', onResize);
    ro.disconnect();
    offTick();
    lenis?.destroy();
    lenis = null;
    stages.length = 0;
  };
}

export function scrollToEl(target: HTMLElement | number, immediate = false) {
  lenis?.scrollTo(target, { duration: immediate ? 0 : 1.8, immediate, force: true, easing: (t) => 1 - Math.pow(1 - t, 4) });
}
