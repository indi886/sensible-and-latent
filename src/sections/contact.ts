// 09 · Defrost — zoom-out. Frost closes over the frame, the reversing valve shifts, hot gas melts it
// from the centre out, and the lens pulls back onto the work order.
import { FrostGL } from '../gl/frost';
import { stage, scroll } from '../core/scroll';
import { onTick } from '../core/loop';
import { lerp, range, fmt } from '../core/math';
import { hudState } from '../ui/hud';
import { Disposer } from '../core/disposer';

export function createContact() {
  const root = document.getElementById('contact')!;
  const defrost = root.querySelector<HTMLElement>('.defrost')!;
  const st = stage(defrost);
  const gl = new FrostGL(root.querySelector('canvas')!, st);
  return {
    gl,
    init() {
      const d = new Disposer();
      const title = root.querySelector<HTMLElement>('[data-defrost-title]')!;
      const temp = root.querySelector<HTMLElement>('[data-defrost-temp]')!;
      const state = root.querySelector<HTMLElement>('[data-defrost-state]')!;
      const mode = root.querySelector<HTMLElement>('[data-defrost-mode]')!;
      const bg = root.querySelector<HTMLElement>('[data-defrost-bg]')!;
      let lastState = '';
      d.add(onTick(() => {
        if (!st.inView) return;
        const p = st.progress;
        gl.grow = range(p, 0.0, 0.4);
        // the defrost clears the middle and leaves ice in the corners, like a real coil after the cycle
        const cornerR = Math.hypot(0.5 * scroll.vw / scroll.vh, 0.5);
        gl.melt = range(p, 0.46, 0.9) * 0.86 * cornerR;
        gl.zoom = lerp(1.45, 1.0, range(p, 0.42, 1.0));
        const z = lerp(1.18, 1.0, range(p, 0.42, 1.0));
        title.style.transform = `scale(${z.toFixed(4)})`;
        title.style.opacity = range(p, 0.5, 0.74).toFixed(3);
        bg.style.opacity = ((0.55 * range(p, 0.0, 0.2)) * (1 - range(p, 0.5, 0.8))).toFixed(3);
        bg.style.transform = `scale(${lerp(1.12, 1.0, range(p, 0, 1)).toFixed(4)})`;
        const coil = p < 0.44 ? lerp(31.8, 26.4, range(p, 0, 0.4)) : lerp(26.4, 58.0, range(p, 0.44, 0.92));
        temp.textContent = fmt(coil, 1);
        hudState.spot = coil;
        const s = p < 0.44 ? 'frosting' : p < 0.9 ? 'defrost · hot gas to the coil' : 'clear · back to heating';
        if (s !== lastState) {
          state.textContent = s;
          mode.textContent = p < 0.44 ? 'heating mode, 28 °F outside' : 'reversing valve energised';
          lastState = s;
        }
      }, 50));
      initForm(root, d);
      return { dispose: () => d.dispose() };
    },
  };
}

function initForm(root: HTMLElement, d: Disposer) {
  const form = root.querySelector<HTMLFormElement>('[data-ticket]')!;
  const status = root.querySelector<HTMLElement>('[data-ticket-status]')!;
  const no = root.querySelector<HTMLElement>('[data-ticket-no]')!;
  const now = new Date();
  const ticket = `SL-${String(now.getFullYear()).slice(2)}-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 900) + 100)}`;
  no.textContent = ticket;
  d.listen(form, 'submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const missing = ['name', 'phone', 'address'].filter((k) => !String(data.get(k) ?? '').trim());
    for (const k of ['name', 'phone', 'address']) form.querySelector(`[name="${k}"]`)?.setAttribute('aria-invalid', String(missing.includes(k)));
    if (missing.length) {
      status.textContent = `We need your ${missing.join(', ').replace('address', 'address or ZIP')} to book the visit.`;
      (form.querySelector(`[name="${missing[0]}"]`) as HTMLInputElement | null)?.focus();
      return;
    }
    const symptoms = data.getAll('symptom').join(', ') || 'not specified';
    const body = [
      `Work order ${ticket}`, `Name: ${data.get('name')}`, `Phone: ${data.get('phone')}`, `Email: ${data.get('email') || '—'}`,
      `Address / ZIP: ${data.get('address')}`, `House: ${data.get('sqft') || '?'} ft², built ${data.get('year') || '?'}, system ${data.get('age') || '?'} yrs`,
      `Symptoms: ${symptoms}`, `Notes: ${data.get('notes') || '—'}`,
    ].join('\n');
    const endpoint = import.meta.env.VITE_FORM_ENDPOINT as string | undefined;
    if (endpoint) {
      status.textContent = 'Sending…';
      try {
        const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket, ...Object.fromEntries(data.entries()), symptoms }) });
        if (!res.ok) throw new Error(String(res.status));
        status.textContent = `Booked as ${ticket}. Priya will call you within one working day to set the visit.`;
        form.reset();
      } catch {
        status.textContent = 'That didn\'t go through. Call (520) 555-0187 and quote ' + ticket + '.';
      }
      return;
    }
    // no backend configured: hand the finished work order to the visitor's mail app
    location.href = `mailto:office@sensibleandlatent.com?subject=${encodeURIComponent(`Load calc visit · ${ticket}`)}&body=${encodeURIComponent(body)}`;
    status.textContent = `Your mail app has the work order ${ticket}. Send it and we'll call within one working day.`;
  });
}
