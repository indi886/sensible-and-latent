// 01 · Start-up. Choreographs the hero: the intro (compressor kick → refrigerant front → frost →
// title condenses out of heat shimmer) starts only after the preloader has fully cleared. Scroll
// then pushes the camera through a fin gap into the film, and a crisp DOM <video> takes over.
import gsap from 'gsap';
import { HeroGL } from '../gl/hero';
import { stage } from '../core/scroll';
import { onTick } from '../core/loop';
import { clamp, invLerp, fmt } from '../core/math';
import { reducedMotion, isNarrow } from '../core/env';
import { cached, MEDIA } from '../core/assets';
import { splitChars } from '../ui/split';
import { pointer } from '../ui/cursor';
import { Disposer } from '../core/disposer';

export function createHero() {
  const root = document.getElementById('hero')!;
  const st = stage(root);
  const gl = new HeroGL(root.querySelector('canvas')!, st, '', cached(MEDIA.galv), cached(MEDIA.copper));
  return { gl, init: () => initHero(root, gl, st) };
}

function initHero(root: HTMLElement, gl: HeroGL, st: ReturnType<typeof stage>) {
  const d = new Disposer();
  const title = root.querySelector<HTMLElement>('[data-hero-title]')!;
  const chars = splitChars(title);
  const kicker = root.querySelector<HTMLElement>('[data-hero-kicker]')!;
  const lede = root.querySelector<HTMLElement>('[data-hero-lede]')!;
  const data = root.querySelector<HTMLElement>('[data-hero-data]')!;
  const cue = root.querySelector<HTMLElement>('[data-hero-cue]')!;
  const copy = root.querySelector<HTMLElement>('.hero-copy')!;
  const takeover = root.querySelector<HTMLVideoElement>('[data-takeover]')!;
  const cap = root.querySelector<HTMLElement>('[data-takeover-cap]')!;
  const shimmerMap = document.querySelector<SVGFEDisplacementMapElement>('[data-shimmer-map]')!;
  const shimmerNoise = document.querySelector<SVGFETurbulenceElement>('[data-shimmer-noise]')!;
  const read = {
    rpm: root.querySelector<HTMLElement>('[data-hd-rpm]')!,
    psig: root.querySelector<HTMLElement>('[data-hd-psig]')!,
    sst: root.querySelector<HTMLElement>('[data-hd-sst]')!,
    sh: root.querySelector<HTMLElement>('[data-hd-sh]')!,
    face: root.querySelector<HTMLElement>('[data-hd-face]')!,
  };

  // pre-intro state: nothing important is visible behind the preloader
  gsap.set(chars, { opacity: 0, yPercent: 38 });
  gsap.set([kicker, lede, data, cue], { opacity: 0, y: 16 });
  title.style.fontStretch = '125%';
  const v = { rpm: 0, psig: 248, sst: 96, sh: 0, face: 96, shimmer: 90, stretch: 125 };
  let introDone = false;

  const renderReadings = () => {
    read.rpm.textContent = fmt(v.rpm);
    read.psig.textContent = fmt(v.psig);
    read.sst.textContent = fmt(v.sst, 1);
    read.sh.textContent = fmt(v.sh, 1);
    read.face.textContent = fmt(v.face, 1);
  };
  renderReadings();

  const intro = () => {
    gl.playVideo();
    const tl = gsap.timeline({
      onUpdate: renderReadings,
      onComplete: () => { introDone = true; title.style.filter = 'none'; },
    });
    // compressor kick
    tl.call(() => { gl.jolt = 1; }, [], 0)
      .to(v, { rpm: 3450, duration: 1.3, ease: 'power2.out' }, 0)
      .to(v, { psig: 118, sst: 40, duration: 2.6, ease: 'power3.out' }, 0.2)
      .to(v, { sh: 10.2, duration: 2.2, ease: 'power2.inOut' }, 1.0)
      .to(v, { face: 41.3, duration: 3.6, ease: 'power2.inOut' }, 0.6)
      // the refrigerant front runs the circuit; frost follows it; the air turns
      .to(gl.u.uCharge, { value: 1, duration: 3.2, ease: 'power1.inOut' }, 0.15)
      .to(gl.u.uFrost, { value: 1, duration: 4.4, ease: 'power1.inOut' }, 0.6)
      .to(gl.u.uCool, { value: 1, duration: 3.2, ease: 'sine.inOut' }, 0.5)
      .to(gl.u.uGain, { value: 1, duration: 2.6, ease: 'power2.inOut' }, 0.05)
      // the title condenses: Expanded vapour → condensed, heavy liquid
      .to(chars, { opacity: 1, yPercent: 0, duration: 1.4, ease: 'expo.out', stagger: { each: 0.045, from: 'start' } }, 0.35)
      .to(v, {
        shimmer: 0, stretch: isNarrow() ? 92 : 84, duration: 2.3, ease: 'power3.inOut',
        onUpdate: () => {
          shimmerMap.setAttribute('scale', v.shimmer.toFixed(1));
          title.style.fontStretch = `${v.stretch.toFixed(1)}%`;
        },
      }, 0.3)
      .to([kicker, lede, data], { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.12 }, 1.5)
      .to(cue, { opacity: 1, y: 0, duration: 0.8 }, 2.6);
    if (reducedMotion) tl.progress(1);
  };

  // the takeover film loads only after the intro begins, at the resolution the screen can show
  const loadTakeover = () => {
    takeover.src = innerWidth > 900 && devicePixelRatio * innerWidth > 1400 ? MEDIA.reel1080 : cached(MEDIA.reel720);
    takeover.preload = 'auto';
  };

  let playing = false;
  let shimmerT = 0;
  d.add(onTick((dt) => {
    const p = st.progress;
    gl.push = invLerp(0.07, 0.8, p);
    gl.pointer.set(pointer.nx, pointer.ny);
    // copy lifts away as the dolly starts
    const out = invLerp(0.04, 0.2, p);
    copy.style.transform = `translate3d(0, ${(-out * 14).toFixed(2)}vh, 0)`;
    copy.style.opacity = String(1 - out);
    copy.style.filter = out > 0.01 ? `blur(${(out * 10).toFixed(1)}px)` : '';
    data.style.opacity = introDone ? String(1 - invLerp(0.05, 0.16, p)) : data.style.opacity;
    cue.style.opacity = introDone ? String(1 - invLerp(0.01, 0.06, p)) : cue.style.opacity;
    // the crisp film takes over from the texture
    const tk = invLerp(0.72, 0.86, p);
    takeover.style.opacity = String(tk);
    cap.style.opacity = String(invLerp(0.88, 0.94, p));
    gl.occluded = tk >= 0.999;
    if (tk > 0 && !playing) {
      playing = true;
      try { takeover.currentTime = gl.videoTime; } catch { /* not seekable yet */ }
      takeover.play().catch(() => {});
    } else if (tk === 0 && playing) {
      playing = false;
      takeover.pause();
    }
    if (gl.occluded) gl.pauseVideo(); else if (introDone || p > 0) gl.playVideo();
    // keep the heat shimmer turbulence drifting while it is visible
    if (!introDone) {
      shimmerT += dt;
      shimmerNoise.setAttribute('baseFrequency', `${(0.012 + Math.sin(shimmerT * 1.3) * 0.002).toFixed(4)} ${(0.06 + Math.sin(shimmerT * 2.1) * 0.01).toFixed(4)}`);
    }
  }, 50));

  return {
    intro: () => { intro(); loadTakeover(); },
    isIntroDone: () => introDone,
    dispose: () => d.dispose(),
    progress: () => clamp(st.progress),
  };
}
