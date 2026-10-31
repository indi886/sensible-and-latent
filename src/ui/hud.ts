// The viewfinder: a thermal imager's readout. Take / move / lens / timecode / spot temperature,
// letterbox bars on the 3D takes, a cut pulse between takes, and a pressure–enthalpy chart whose
// dot follows one pound of refrigerant around the cycle as the page scrolls.
import gsap from 'gsap';
import { onTick } from '../core/loop';
import { scroll } from '../core/scroll';
import { clamp } from '../core/math';
import { reducedMotion } from '../core/env';

export const hudState = { take: 0, spot: 74, takeEl: null as HTMLElement | null };

const q = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;

export function initHud(takes: HTMLElement[]) {
  const takeNo = q('[data-hud-take]');
  const takeName = q('[data-hud-name]');
  const move = q('[data-hud-move]');
  const lens = q('[data-hud-lens]');
  const spot = q('[data-hud-spot]');
  const tc = q('[data-hud-tc]');
  const pulse = q('.cut-pulse');
  const corners = q('.hud-corners');
  const dot = q<SVGCircleElement>('[data-ph-dot]');
  const cycle = q<SVGPathElement>('.ph-cycle');
  const phState = q('[data-ph-state]');
  const phP = q('[data-ph-p]');
  const phT = q('[data-ph-t]');
  const total = cycle.getTotalLength();
  // segment lengths of "M52 70 L128 70 L144 22 L52 22 Z": evaporate, compress, condense, meter
  const sEvap = 76, sComp = Math.hypot(16, 48), sCond = 92;

  let tops: number[] = [];
  const measure = () => {
    tops = takes.map((el) => el.getBoundingClientRect().top + scroll.y);
    const vw = innerWidth, vh = innerHeight;
    const lb = vw > vh ? clamp((vh - vw / 2.25) / 2, 0, vh * 0.1) : vh * 0.055;
    document.documentElement.style.setProperty('--lb', `${Math.round(lb)}px`);
  };
  measure();
  addEventListener('resize', measure);
  const ro = new ResizeObserver(measure);
  ro.observe(document.body);

  let active = -1;
  let lastTc = '';
  let lastSpot = '';
  let lastPh = '';
  const setTake = (i: number) => {
    const el = takes[i];
    hudState.take = i;
    hudState.takeEl = el;
    takeNo.textContent = el.dataset.take ?? '';
    takeName.textContent = el.dataset.name ?? '';
    move.textContent = el.dataset.move ?? '';
    lens.textContent = el.dataset.lens ?? '';
    hudState.spot = Number(el.dataset.spot ?? 74);
    document.body.classList.toggle('lb-on', el.hasAttribute('data-letterbox'));
    if (!reducedMotion && active !== -1) {
      // the cut: a two-frame flash and the corner brackets snapping in
      gsap.fromTo(pulse, { opacity: 0.6 }, { opacity: 0, duration: 0.42, ease: 'power3.out', overwrite: true });
      gsap.fromTo(corners, { scale: 1.035 }, { scale: 1, duration: 0.5, ease: 'expo.out', overwrite: true });
    }
  };

  const off = onTick((_dt, time) => {
    const line = scroll.y + scroll.vh * 0.5;
    let i = 0;
    while (i < tops.length - 1 && tops[i + 1] <= line) i++;
    if (i !== active) { setTake(i); active = i; }

    const p = clamp(scroll.y / Math.max(1, scroll.docH - scroll.vh));
    // timecode: the page is a six-minute take at 24 fps
    const secs = p * 360;
    const ff = Math.floor((secs % 1) * 24);
    const s = Math.floor(secs);
    const tcs = `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
    if (tcs !== lastTc) { tc.textContent = tcs; lastTc = tcs; }

    const sp = (hudState.spot + Math.sin(time * 1.7) * 0.12 + Math.sin(time * 4.3) * 0.05).toFixed(1);
    if (sp !== lastSpot) { spot.textContent = sp; lastSpot = sp; }

    // refrigerant state: start just past the evaporator outlet, go once around the cycle
    const pos = (sEvap - 6 + p * total) % total;
    const pt = cycle.getPointAtLength(pos);
    dot.setAttribute('cx', pt.x.toFixed(2));
    dot.setAttribute('cy', pt.y.toFixed(2));
    let label: string;
    if (pos < sEvap) label = pos > sEvap - 12 ? 'Superheated vapour' : 'Evaporating · saturated mix';
    else if (pos < sEvap + sComp) label = 'Compression · superheated';
    else if (pos < sEvap + sComp + sCond) {
      const x = pt.x;
      label = x > 106 ? 'Desuperheating' : x > 58 ? 'Condensing · saturated mix' : 'Subcooled liquid';
    } else label = 'Metering device · flash gas';
    const hi = clamp((70 - pt.y) / 48);
    const psig = Math.round(118 + (380 - 118) * hi);
    const temp = Math.round(40 + (115 - 40) * hi + (pos > sEvap && pos < sEvap + sComp ? 60 * Math.sin(hi * Math.PI * 0.5) : 0));
    const key = `${label}|${psig}|${temp}`;
    if (key !== lastPh) {
      phState.textContent = label;
      phP.textContent = String(psig);
      phT.textContent = String(temp);
      lastPh = key;
    }
  }, 90);

  return () => { off(); ro.disconnect(); removeEventListener('resize', measure); };
}
