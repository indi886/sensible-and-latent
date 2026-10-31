// Boot order: loop + scroll (locked) → evacuation preloader streams the critical bytes → every take is
// built (WebGL scenes + DOM controllers) → shaders compile and textures upload during the decay test
// → the preloader parts → only then does the hero intro start and scrolling unlock.
// Everything registers a disposer; pagehide and Vite HMR tear the page down completely.
import './styles/main.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { startLoop, stopLoop, onTick } from './core/loop';
import { initScroll, measureStages, lenis } from './core/scroll';
import { Preloader } from './core/preloader';
import { releaseCache, cached, MEDIA } from './core/assets';
import { initThemes } from './core/themes';
import { reducedMotion } from './core/env';
import { initHud } from './ui/hud';
import { initCursor } from './ui/cursor';
import { initMagnetic } from './ui/magnetic';
import { initGrain } from './ui/grain';
import { createHero } from './sections/hero';
import { createAbout } from './sections/about';
import { createServices } from './sections/services';
import { createProcess } from './sections/process';
import { createProjects } from './sections/projects';
import { initTestimonials } from './sections/testimonials';
import { initTeam } from './sections/team';
import { initFaq } from './sections/faq';
import { createContact } from './sections/contact';
import type { GLStage } from './gl/stage';

const teardown: Array<() => void> = [];

async function boot() {
  history.scrollRestoration = 'manual';
  scrollTo(0, 0);
  if (reducedMotion) document.documentElement.classList.add('reduced-motion');
  startLoop();
  teardown.push(initScroll());
  initGrain();

  const pre = new Preloader();
  const loading = pre.load();
  // the first two takes start compiling as soon as their small textures land, while the reel streams
  await pre.ready([MEDIA.galv, MEDIA.copper, MEDIA.window]);
  const hero = createHero();
  const about = createAbout();
  const t0 = performance.now();
  const times: Record<string, number> = {};
  const warm = (g: GLStage) => g.warm().then(() => { times[g.constructor.name] = Math.round(performance.now() - t0); });
  const firstWarm = Promise.all([warm(hero.gl), warm(about.gl)]);
  await loading;
  hero.gl.setVideo(cached(MEDIA.reel720));

  // build the remaining takes, top to bottom
  const services = createServices();
  const process = createProcess();
  const projects = createProjects();
  const contact = createContact();
  const gls: GLStage[] = [hero.gl, about.gl, services.gl, process.gl, projects.gl, contact.gl];

  const heroCtl = hero.init();
  const ctls = [heroCtl, about.init(), services.init(), process.init(), projects.init(), initTestimonials(), initTeam(), initFaq(), contact.init()];
  teardown.push(() => ctls.forEach((c) => c.dispose()));

  // decay test: compile every program and upload every texture while the gauge holds
  // the first two takes must be compiled before the preloader parts; the rest compile in the
  // background during the intro, in page order, each fading in once ready (never a stall on scroll-in)
  await pre.holdWhile(firstWarm);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__bootTimes = times;
  teardown.push(onTick((dt, t) => { for (const g of gls) g.frame(dt, t); }, 80));
  teardown.push(() => gls.forEach((g) => g.dispose()));
  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = window.setTimeout(() => gls.forEach((g) => g.resize()), 100); };
  addEventListener('resize', onResize);
  teardown.push(() => removeEventListener('resize', onResize));

  const takes = Array.from(document.querySelectorAll<HTMLElement>('.take'));
  measureStages();
  ScrollTrigger.refresh();
  teardown.push(initThemes(takes), initHud(takes), initCursor(), initMagnetic());

  // anchor links glide with Lenis
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const el = document.querySelector<HTMLElement>(a.getAttribute('href')!);
    if (!el) return;
    e.preventDefault();
    lenis?.scrollTo(el, { duration: reducedMotion ? 0 : 2.2 });
  };
  document.addEventListener('click', onClick);
  teardown.push(() => document.removeEventListener('click', onClick));

  // nothing important happens until the preloader has completely cleared
  await pre.exit();
  document.body.classList.remove('is-loading');
  document.body.classList.add('is-live');
  lenis?.start();
  heroCtl.intro();
  (async () => {
    await new Promise((r) => setTimeout(r, 400));
    for (const g of [services.gl, process.gl, projects.gl, contact.gl]) await warm(g);
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__allWarm = { loadDone: Math.round(t0), ...times };
  })();

  if (import.meta.env.DEV) {
    const { installHooks } = await import('./dev/hooks');
    installHooks({ heroCtl, process: process.gl, projects: projects.gl });
  }
}

function destroy() {
  while (teardown.length) {
    try { teardown.pop()!(); } catch (err) { console.warn('[teardown]', err); }
  }
  ScrollTrigger.getAll().forEach((t) => t.kill());
  gsap.globalTimeline.clear();
  stopLoop();
  releaseCache();
}

addEventListener('pagehide', (e) => { if (!e.persisted) destroy(); });
addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
if (import.meta.hot) import.meta.hot.dispose(destroy);

boot().catch((err) => {
  console.error(err);
  // never leave the visitor behind the gauge
  document.getElementById('preloader')?.remove();
  document.body.classList.remove('is-loading');
  document.body.classList.add('is-live');
  lenis?.start();
});
