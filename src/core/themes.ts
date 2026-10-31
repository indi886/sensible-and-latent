// Each take has a temperature, and the temperature picks its palette: frost-light for the cold half
// of the cycle, copper-dark for the hot half. The page colours blend between adjacent takes as the
// boundary crosses the lower part of the viewport.
import { onTick } from './loop';
import { scroll } from './scroll';
import { clamp, hexToRgb } from './math';

type Theme = { bg: string; ink: string; muted: string; accent: string; warm: string; rule: string };
const T = (bg: string, ink: string, muted: string, accent: string, warm: string, rule: string): Theme => ({ bg, ink, muted, accent, warm, rule });

export const THEMES: Record<string, Theme> = {
  coil: T('#0D0F11', '#EAF1F3', '#8A949A', '#63B3E8', '#C46A36', '#2C3236'),
  desert: T('#120D0A', '#F6EEE6', '#A99381', '#E39A63', '#C46A36', '#3A2C22'),
  ir: T('#0B0712', '#F4EEF7', '#9C8AA8', '#F2A33A', '#E0623A', '#2E2338'),
  site: T('#0D0F11', '#EAF1F3', '#8A949A', '#63B3E8', '#C46A36', '#2C3236'),
  dusk: T('#070B13', '#E6EEF5', '#7D8DA0', '#63B3E8', '#C46A36', '#1E2838'),
  chart: T('#EAF1F3', '#0D0F11', '#56636B', '#2A6F9E', '#B65A28', '#B9C6CC'),
  plate: T('#DCE4E7', '#0D0F11', '#4F5C64', '#2A6F9E', '#B65A28', '#AEBBC1'),
  tree: T('#EEF3F4', '#0D0F11', '#56636B', '#2A6F9E', '#B65A28', '#C3CED3'),
  defrost: T('#0D0F11', '#EAF1F3', '#8A949A', '#63B3E8', '#C46A36', '#2C3236'),
};

const KEYS: Array<keyof Theme> = ['bg', 'ink', 'muted', 'accent', 'warm', 'rule'];
const mix = (a: string, b: string, t: number) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)} ${Math.round(A[1] + (B[1] - A[1]) * t)} ${Math.round(A[2] + (B[2] - A[2]) * t)})`;
};

export function initThemes(takes: HTMLElement[]) {
  const root = document.documentElement.style;
  const meta = document.querySelector('meta[name="theme-color"]');
  let tops: number[] = [];
  const measure = () => { tops = takes.map((el) => el.getBoundingClientRect().top + scroll.y); };
  measure();
  addEventListener('resize', measure);
  const ro = new ResizeObserver(measure);
  ro.observe(document.body);
  let last = '';
  const off = onTick(() => {
    const line = scroll.y + scroll.vh * 0.62;
    let i = 0;
    while (i < tops.length - 1 && tops[i + 1] <= line) i++;
    let t = 0;
    const next = takes[i + 1];
    if (next) t = clamp((line - (tops[i + 1] - scroll.vh * 0.32)) / (scroll.vh * 0.32));
    const a = THEMES[takes[i].dataset.theme ?? 'coil'];
    const b = next ? THEMES[next.dataset.theme ?? 'coil'] : a;
    const key = `${i}:${t.toFixed(3)}`;
    if (key === last) return;
    last = key;
    for (const k of KEYS) root.setProperty(`--${k}`, t <= 0 ? a[k] : mix(a[k], b[k], t));
    meta?.setAttribute('content', t < 0.5 ? a.bg : b.bg);
  }, 12);
  return () => { off(); ro.disconnect(); removeEventListener('resize', measure); };
}
