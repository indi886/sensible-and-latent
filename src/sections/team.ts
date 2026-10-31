// 07 · Rating plates — snap zoom. Each member snaps into frame (a fast zoom that lands sharp), the
// rivets set, the plate's rows are stamped in a character at a time, and the portrait comes up from
// a thermal image to colour, like a person reading 98.6 °F.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { splitChars } from '../ui/split';
import { reducedMotion } from '../core/env';

export function initTeam() {
  const root = document.getElementById('team')!;
  const members = Array.from(root.querySelectorAll<HTMLElement>('[data-member]'));
  const triggers: ScrollTrigger[] = [];
  const title = root.querySelector<HTMLElement>('.team-title')!;
  gsap.set(title, { opacity: 0, y: 40 });
  triggers.push(ScrollTrigger.create({
    trigger: title, start: 'top 85%', once: true,
    onEnter: () => gsap.to(title, { opacity: 1, y: 0, duration: reducedMotion ? 0 : 1.1, ease: 'expo.out' }),
  }));
  members.forEach((m, i) => {
    const chars = Array.from(m.querySelectorAll<HTMLElement>('.plate-rows dd')).flatMap((dd) => splitChars(dd, 'st'));
    const rivets = m.querySelectorAll('.rivet');
    const plate = m.querySelector<HTMLElement>('.plate')!;
    if (reducedMotion) { m.classList.add('is-warm'); return; }
    gsap.set(m, { opacity: 0, scale: 1.45, filter: 'blur(14px)' });
    gsap.set(chars, { opacity: 0 });
    gsap.set(rivets, { scale: 0 });
    const tl = gsap.timeline({ paused: true });
    tl.to(m, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.5, ease: 'expo.out' })
      .to(rivets, { scale: 1, duration: 0.18, ease: 'back.out(3)', stagger: 0.05 }, 0.32)
      .fromTo(plate, { y: 3 }, { y: 0, duration: 0.25, ease: 'power2.out' }, 0.32)
      .to(chars, { opacity: 1, duration: 0.01, stagger: 0.008, ease: 'steps(1)' }, 0.42)
      .call(() => m.classList.add('is-warm'), [], 0.9);
    triggers.push(ScrollTrigger.create({
      trigger: m, start: 'top 82%',
      onEnter: () => tl.delay(i % 2 ? 0.12 : 0).play(),
      onLeaveBack: () => { tl.pause(0); m.classList.remove('is-warm'); },
    }));
  });
  return { dispose: () => triggers.forEach((t) => t.kill()) };
}
