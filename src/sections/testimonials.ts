// 06 · Seven-day charts — overhead lock-off. Each client's words sit beside the circular chart
// recorder that logged their house for a week: the paper turns under a fixed pen, the trace swings
// with the afternoon heat until the install day, then goes flat. The quote is set word by word as
// the pen passes the install mark.
import { stage } from '../core/scroll';
import { onTick } from '../core/loop';
import { clamp, invLerp, smooth, fmt, mulberry32 } from '../core/math';
import { hudState } from '../ui/hud';
import { splitWords } from '../ui/split';
import { show } from './window';
import { Disposer } from '../core/disposer';

type Trace = { who: string; install: number; before: (h: number, day: number) => number; after: (h: number) => number; rhBefore: (h: number) => number; rhAfter: number };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TMIN = 40, TMAX = 110;

const rnd = mulberry32(31);
const jitter = Array.from({ length: 2000 }, () => rnd() - 0.5);
const J = (t: number) => jitter[Math.floor(Math.abs(t) * 40) % jitter.length];
const afternoon = (h: number) => Math.max(0, Math.sin(((h - 9) / 13) * Math.PI));

const TRACES: Trace[] = [
  // back bedroom: 9 °F above the hall every afternoon, then flat at 75
  { who: 'Koenig residence · back bedroom', install: 2.55, before: (h, d) => 76.5 + 8.8 * afternoon(h) + (d % 2) * 0.6, after: (h) => 75 + 0.35 * Math.sin(h / 3), rhBefore: (h) => 58 + 7 * Math.sin(h / 4), rhAfter: 47 },
  // far register supply air: lukewarm through leaky ducts, then cold
  { who: 'Ochoa residence · far register', install: 2.4, before: (h) => 71 + 2.2 * afternoon(h) + 1.4 * Math.sin(h * 2.6), after: (h) => 57 + 1.1 * Math.sin(h * 2.2), rhBefore: (h) => 63 + 6 * Math.sin(h / 3.5), rhAfter: 49 },
  // dental operatory on a tired rooftop unit, then held
  { who: 'Farouk Dental · operatory 2', install: 2.7, before: (h, d) => 72 + 6.5 * afternoon(h) * (0.8 + 0.2 * (d % 3)), after: (h) => 72 + 0.25 * Math.sin(h * 1.7), rhBefore: (h) => 55 + 8 * afternoon(h), rhAfter: 45 },
];

export function initTestimonials() {
  const root = document.getElementById('testimonials')!;
  const st = stage(root);
  const d = new Disposer();
  const canvas = root.querySelector<HTMLCanvasElement>('[data-chart]')!;
  const wrap = root.querySelector<HTMLElement>('.chart-wrap')!;
  const ctx = canvas.getContext('2d')!;
  const voices = Array.from(root.querySelectorAll<HTMLElement>('[data-voice]'));
  const words = voices.map((v) => splitWords(v.querySelector<HTMLElement>('.voice-q')!));
  const byLines = voices.map((v) => v.querySelector<HTMLElement>('.voice-by')!);
  const who = root.querySelector<HTMLElement>('[data-chart-who]')!;
  const dayEl = root.querySelector<HTMLElement>('[data-chart-day]')!;
  const tempEl = root.querySelector<HTMLElement>('[data-chart-temp]')!;
  const rhEl = root.querySelector<HTMLElement>('[data-chart-rh]')!;
  // the latent half: a second pen logs relative humidity (20–90 % on the same rings as 40–110 °F)
  const rhAt = (tr: Trace, day: number) => {
    const h = (day % 1) * 24;
    const v = day < tr.install ? tr.rhBefore(h) : tr.rhAfter + 1.2 * Math.sin(h / 2.5);
    return v + J(day * 31) * (day < tr.install ? 1.4 : 0.4);
  };
  let lastRh = 0;
  let size = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(devicePixelRatio, 2);
    size = wrap.clientWidth;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  };
  resize();
  d.listen(window, 'resize', resize);

  const tempAt = (tr: Trace, day: number) => {
    const h = (day % 1) * 24;
    const raw = day < tr.install ? tr.before(h, Math.floor(day)) : tr.after(h);
    return raw + J(day * 24) * (day < tr.install ? 0.7 : 0.18);
  };
  const css = getComputedStyle(document.documentElement);
  void css;

  const draw = (k: number, t: number) => {
    const tr = TRACES[k];
    const R = size * 0.47, cx = size / 2, cy = size / 2;
    const rot = (t / 7) * Math.PI * 2;
    const ang = (day: number) => -Math.PI / 2 + rot - (day / 7) * Math.PI * 2;
    const rad = (T: number) => R * (0.2 + 0.76 * clamp((T - TMIN) / (TMAX - TMIN)));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // paper
    const g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.1, cx, cy, R * 1.02);
    g.addColorStop(0, '#FBFDFD'); g.addColorStop(1, '#E3ECEF');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(13,15,17,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    // temperature rings
    ctx.font = `500 ${Math.max(8, size * 0.018)}px "Archivo Variable", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let T = TMIN; T <= TMAX; T += 5) {
      const major = T % 10 === 0;
      ctx.strokeStyle = major ? 'rgba(42,111,158,0.42)' : 'rgba(42,111,158,0.16)';
      ctx.lineWidth = major ? 0.9 : 0.6;
      ctx.beginPath(); ctx.arc(cx, cy, rad(T), 0, Math.PI * 2); ctx.stroke();
    }
    // time arcs: hours (curved, like real chart paper) and days
    for (let hIdx = 0; hIdx < 7 * 8; hIdx++) {
      const day = hIdx / 8;
      const major = hIdx % 8 === 0;
      const a = ang(day);
      ctx.strokeStyle = major ? 'rgba(42,111,158,0.55)' : 'rgba(42,111,158,0.18)';
      ctx.lineWidth = major ? 1 : 0.6;
      ctx.beginPath();
      for (let s = 0; s <= 10; s++) {
        const rr = rad(TMIN) + (R - rad(TMIN)) * (s / 10);
        const bend = (s / 10) * 0.18;
        const x = cx + Math.cos(a + bend) * rr, y = cy + Math.sin(a + bend) * rr;
        s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (major) {
        const la = ang(day + 0.5);
        ctx.fillStyle = 'rgba(13,15,17,0.7)';
        ctx.save(); ctx.translate(cx + Math.cos(la) * R * 0.985, cy + Math.sin(la) * R * 0.985); ctx.rotate(la + Math.PI / 2);
        ctx.fillText(DAYS[Math.floor(day)].toUpperCase(), 0, -size * 0.012);
        ctx.restore();
      }
    }
    // temperature labels along the noon line of the current day
    ctx.fillStyle = 'rgba(42,111,158,0.85)';
    for (let T = 50; T <= 100; T += 10) {
      const a = -Math.PI / 2 - 0.06;
      ctx.fillText(String(T), cx + Math.cos(a) * rad(T), cy + Math.sin(a) * rad(T));
    }
    // install mark
    const ia = ang(tr.install);
    ctx.strokeStyle = '#B65A28'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(ia) * rad(TMIN), cy + Math.sin(ia) * rad(TMIN)); ctx.lineTo(cx + Math.cos(ia) * R, cy + Math.sin(ia) * R); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#B65A28';
    ctx.save(); ctx.translate(cx + Math.cos(ia) * R * 0.9, cy + Math.sin(ia) * R * 0.9); ctx.rotate(ia + Math.PI / 2);
    ctx.fillText('INSTALL', 0, 0); ctx.restore();
    // the trace, in recorder ink
    ctx.strokeStyle = '#B65A28'; ctx.lineWidth = Math.max(1.4, size * 0.0042); ctx.lineJoin = 'round';
    ctx.beginPath();
    const steps = Math.max(2, Math.floor(t * 96));
    let last = 0;
    for (let i = 0; i <= steps; i++) {
      const day = (i / steps) * t;
      last = tempAt(tr, day);
      const a = ang(day), rr = rad(last);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    // humidity pen, offset a little behind the temperature pen as on a real two-pen recorder
    ctx.strokeStyle = 'rgba(42,111,158,0.85)'; ctx.lineWidth = Math.max(1.1, size * 0.0032);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const day = (i / steps) * Math.max(0, t - 0.04);
      lastRh = rhAt(tr, day);
      const a = ang(day) - 0.0, rr = rad(lastRh + 20);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    // hub
    ctx.fillStyle = '#0D0F11';
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.022, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#C8D2D6';
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.008, 0, Math.PI * 2); ctx.fill();
    // pen arm: pivots off the paper at the right and swings on an arc to the 12 o'clock line
    const tipR = rad(last);
    const tip = { x: cx, y: cy - tipR };
    const piv = { x: cx + R * 1.02, y: cy - R * 0.98 };
    ctx.strokeStyle = '#2A3036'; ctx.lineWidth = Math.max(2, size * 0.008); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(piv.x, piv.y);
    ctx.quadraticCurveTo((piv.x + tip.x) / 2 + R * 0.05, (piv.y + tip.y) / 2 - R * 0.12, tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = '#B65A28';
    ctx.beginPath(); ctx.arc(tip.x, tip.y, size * 0.009, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2A3036';
    ctx.beginPath(); ctx.arc(piv.x, piv.y, size * 0.016, 0, Math.PI * 2); ctx.fill();
    return last;
  };

  let lastKey = '';
  d.add(onTick(() => {
    if (!st.inView) return;
    const p = st.progress;
    const n = TRACES.length;
    const k = Math.min(n - 1, Math.floor(p * n));
    const f = p * n - k;
    const t = 7 * smooth(clamp(invLerp(0.04, 0.86, f)));
    const key = `${k}|${t.toFixed(4)}|${size}`;
    let pen = 0;
    if (key !== lastKey) { pen = draw(k, t); lastKey = key; tempEl.textContent = fmt(pen, 1); rhEl.textContent = fmt(lastRh); hudState.spot = pen; }
    // overhead lock-off with a slow creep in; the paper swaps between clients
    const swap = Math.min(invLerp(0, 0.05, f), 1 - invLerp(0.95, 1, f));
    wrap.style.transform = `scale(${(0.94 + 0.08 * f).toFixed(4)}) rotate(${((1 - swap) * -8).toFixed(2)}deg)`;
    wrap.style.opacity = (k === 0 ? Math.max(swap, f < 0.5 ? 1 : swap) : swap).toFixed(3);
    who.textContent = TRACES[k].who;
    const day = Math.min(6, Math.floor(t));
    const hh = Math.floor((t % 1) * 24), mm = Math.floor((((t % 1) * 24) % 1) * 60);
    dayEl.textContent = `${DAYS[day]} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    // voices: only the current client's; words appear as the pen passes the install mark
    voices.forEach((v, i) => {
      const on = i === k ? swap : 0;
      show(v, on, 0, 0);
      if (i !== k) return;
      const reveal = clamp((t - TRACES[k].install) / 1.8);
      const ws = words[i];
      const nShow = reveal * ws.length;
      for (let w = 0; w < ws.length; w++) {
        const a = clamp(nShow - w);
        const s = a.toFixed(2);
        if (ws[w].style.opacity !== s) { ws[w].style.opacity = s; ws[w].style.transform = `translate3d(0, ${((1 - a) * 0.4).toFixed(2)}em, 0)`; }
      }
      byLines[i].style.opacity = clamp((reveal - 0.7) / 0.3).toFixed(2);
    });
  }, 50));
  return { dispose: () => d.dispose() };
}
