// Preloader as an evacuation: a digital micron gauge pulls the page from atmosphere (760,000 µ) to
// 500 µ on a log scale, driven by real bytes streamed from the network. Then a short decay test
// holds while shaders compile, and the two halves part. The intro only starts after the exit tween
// has fully completed.
import gsap from 'gsap';
import { criticalAssets, putCache } from './assets';
import { onTick } from './loop';
import { fmt } from './math';
import { reducedMotion } from './env';

const ATM = 760_000;
const TARGET = 500;
const logA = Math.log10(ATM);
const logT = Math.log10(TARGET);

export class Preloader {
  root = document.getElementById('preloader')!;
  private num = this.root.querySelector<HTMLElement>('[data-pl-microns]')!;
  private fill = this.root.querySelector<HTMLElement>('[data-pl-fill]')!;
  private bytesEl = this.root.querySelector<HTMLElement>('[data-pl-bytes]')!;
  private stateEl = this.root.querySelector<HTMLElement>('[data-pl-state]')!;
  private target = 0;
  private shown = 0;
  private hold = false;
  private off: () => void;
  private done = new Map<string, () => void>();
  private waits = new Map<string, Promise<void>>();

  /** resolves when one asset has fully arrived (lets shader compilation start before the rest) */
  ready(urls: string[]) {
    return Promise.all(urls.map((u) => {
      if (!this.waits.has(u)) this.waits.set(u, new Promise<void>((r) => this.done.set(u, r)));
      return this.waits.get(u)!;
    }));
  }
  private finish(url: string) {
    if (!this.waits.has(url)) this.waits.set(url, Promise.resolve());
    this.done.get(url)?.();
  }

  constructor() {
    this.off = onTick((dt) => {
      // ease the displayed vacuum toward the true byte progress (a gauge never jumps)
      this.shown += (this.target - this.shown) * (1 - Math.exp(-dt * 6));
      const p = this.shown;
      const microns = this.hold ? 470 + 6 * Math.sin(performance.now() / 420) : Math.pow(10, logA + (logT - logA) * p);
      this.num.textContent = fmt(microns);
      this.fill.style.transform = `scaleX(${p.toFixed(4)})`;
    }, 5);
  }

  async load(): Promise<void> {
    const list = criticalAssets();
    const totals = list.map((a) => a.est);
    const loaded = list.map(() => 0);
    const update = () => {
      const T = totals.reduce((a, b) => a + b, 0);
      const L = loaded.reduce((a, b) => a + b, 0);
      this.target = Math.min(1, L / T);
      this.bytesEl.textContent = `${(L / 1e6).toFixed(1)} / ${(T / 1e6).toFixed(1)} MB`;
    };
    const fetchOne = async (i: number) => {
      const { url } = list[i];
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        const len = Number(res.headers.get('content-length')) || totals[i];
        totals[i] = len;
        const type = res.headers.get('content-type') ?? '';
        const reader = res.body?.getReader();
        if (!reader) { const b = await res.blob(); loaded[i] = len; putCache(url, URL.createObjectURL(b)); update(); this.finish(url); return; }
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded[i] += value.byteLength;
          update();
        }
        putCache(url, URL.createObjectURL(new Blob(chunks as BlobPart[], { type })));
      } catch (err) {
        console.warn('[preload] failed', url, err);
        loaded[i] = totals[i];
        update();
      }
      this.finish(url);
    };
    // a stalled request can never trap the visitor behind the gauge
    const deadline = new Promise<void>((r) => setTimeout(r, 15000));
    const minShow = new Promise<void>((r) => setTimeout(r, reducedMotion ? 200 : 1100));
    await Promise.race([Promise.all(list.map((_, i) => fetchOne(i))), deadline]);
    await document.fonts.ready;
    await minShow;
    this.target = 1;
    await new Promise((r) => setTimeout(r, reducedMotion ? 50 : 420));
  }

  /** Decay test: hold vacuum while `work` (shader compile, texture upload) runs. */
  async holdWhile(work: Promise<unknown>) {
    this.hold = true;
    this.stateEl.textContent = 'Isolated · decay test';
    await work;
    this.stateEl.textContent = 'Held at 470 µ · tight';
    await new Promise((r) => setTimeout(r, reducedMotion ? 0 : 300));
  }

  /** Breaking vacuum: the halves part. Resolves only after the preloader has fully cleared. */
  exit(): Promise<void> {
    return new Promise((resolve) => {
      const done = () => { this.off(); this.root.remove(); resolve(); };
      if (reducedMotion) { gsap.to(this.root, { opacity: 0, duration: 0.3, onComplete: done }); return; }
      const tl = gsap.timeline({ onComplete: done });
      tl.to(this.root.querySelector('.pl-gauge'), { opacity: 0, y: -18, duration: 0.35, ease: 'power2.in' })
        .to(this.root.querySelector('.pl-top'), { yPercent: -101, duration: 1.0, ease: 'expo.inOut' }, 0.2)
        .to(this.root.querySelector('.pl-bot'), { yPercent: 101, duration: 1.0, ease: 'expo.inOut' }, 0.2);
    });
  }
}
