// DOM-safe splitting: wraps each word in .w (no mid-word breaks) and each glyph in a span, without
// destroying child elements such as <em>. Screen readers keep the original text via aria-label.
export function splitChars(el: HTMLElement, cls = 'ch'): HTMLSpanElement[] {
  if (el.dataset.split) return Array.from(el.querySelectorAll<HTMLSpanElement>(`.${cls}`));
  el.dataset.split = cls;
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.textContent?.trim() ?? '');
  const out: HTMLSpanElement[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? '';
        const frag = document.createDocumentFragment();
        for (const part of text.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); continue; }
          const w = document.createElement('span');
          w.className = 'w';
          w.style.display = 'inline-block';
          w.style.whiteSpace = 'nowrap';
          w.setAttribute('aria-hidden', 'true');
          for (const c of Array.from(part)) {
            const s = document.createElement('span');
            s.className = cls;
            s.textContent = c;
            w.appendChild(s);
            out.push(s);
          }
          frag.appendChild(w);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };
  walk(el);
  return out;
}

export function splitWords(el: HTMLElement): HTMLSpanElement[] {
  if (el.dataset.splitWords) return Array.from(el.querySelectorAll<HTMLSpanElement>('.w'));
  el.dataset.splitWords = '1';
  const words = (el.textContent ?? '').trim().split(/\s+/);
  el.setAttribute('aria-label', el.textContent?.trim() ?? '');
  el.textContent = '';
  return words.map((word, i) => {
    const s = document.createElement('span');
    s.className = 'w';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = word;
    el.appendChild(s);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    return s;
  });
}
