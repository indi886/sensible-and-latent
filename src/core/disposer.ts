// Collects every listener, tween, trigger and GPU handle a module creates, so pagehide and Vite HMR
// can tear the whole page down without leaks.
export class Disposer {
  private fns: Array<() => void> = [];

  add(fn: () => void) {
    this.fns.push(fn);
    return fn;
  }

  listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen<K extends keyof DocumentEventMap>(target: Document, type: K, fn: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions) {
    target.addEventListener(type, fn, opts);
    this.fns.push(() => target.removeEventListener(type, fn, opts));
  }

  dispose() {
    for (let i = this.fns.length - 1; i >= 0; i--) {
      try { this.fns[i](); } catch (err) { console.warn('[dispose]', err); }
    }
    this.fns = [];
  }
}
