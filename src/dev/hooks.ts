// DEV ONLY. Imported behind `import.meta.env.DEV`, so production builds never contain it.
// Lets the headless verification script jump to exact scroll states and wait for animation states.
import { lenis, scroll } from '../core/scroll';
import { onTick } from '../core/loop';
import type { ProcessGL } from '../gl/process';
import type { DamperGL } from '../gl/damper';

type Api = { heroCtl: { isIntroDone: () => boolean }; process: ProcessGL; projects: DamperGL };

export function installHooks(api: Api) {
  const w = window as unknown as Record<string, unknown>;
  w.__SL = {
    ready: true,
    introDone: () => api.heroCtl.isIntroDone(),
    /** jump to a section; for sticky takes `p` is stage progress, otherwise a fraction of its height */
    goto(id: string, p = 0) {
      const el = document.getElementById(id);
      if (!el) return -1;
      const target = el.querySelector<HTMLElement>(':scope > .defrost') ?? el;
      const top = target.getBoundingClientRect().top + scroll.y;
      const h = target.offsetHeight;
      const sticky = !!target.querySelector(':scope > .stage');
      const y = sticky ? top + p * Math.max(0, h - innerHeight) : top + p * h;
      lenis?.scrollTo(y, { immediate: true, force: true });
      return y;
    },
    /** frame-time statistics over `ms` milliseconds of the real loop */
    frameStats(ms = 2000) {
      return new Promise((resolve) => {
        const samples: number[] = [];
        const off = onTick((dt) => samples.push(dt * 1000), 99);
        setTimeout(() => {
          off();
          samples.sort((a, b) => a - b);
          const avg = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
          resolve({ frames: samples.length, avg: +avg.toFixed(2), p95: +(samples[Math.floor(samples.length * 0.95)] ?? 0).toFixed(2), fps: +(1000 / avg).toFixed(1) });
        }, ms);
      });
    },
    state: () => ({ y: scroll.y, processP: api.process.P, damperP: api.projects.P }),
  };
}
