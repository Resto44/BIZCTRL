function scheduleFrame(callback) {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return { kind: 'frame', id: globalThis.requestAnimationFrame(callback) };
  }
  return { kind: 'timer', id: globalThis.setTimeout(callback, 0) };
}

function cancelFrame(handle) {
  if (!handle) return;
  if (handle.kind === 'frame' && typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(handle.id);
    return;
  }
  globalThis.clearTimeout(handle.id);
}

class ResizeObserverFallback {
  constructor(callback) {
    this.callback = callback;
    this.elements = new Set();
    this.pending = null;
    this.notify = this.notify.bind(this);
    globalThis.addEventListener?.('resize', this.notify);
  }

  observe(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return;
    this.elements.add(element);
    this.notify();
  }

  unobserve(element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
    cancelFrame(this.pending);
    this.pending = null;
    globalThis.removeEventListener?.('resize', this.notify);
  }

  notify() {
    if (this.pending || !this.elements.size) return;
    this.pending = scheduleFrame(() => {
      this.pending = null;
      if (!this.elements.size) return;
      const entries = [...this.elements].map((target) => ({
        target,
        contentRect: target.getBoundingClientRect(),
      }));
      this.callback(entries, this);
    });
  }
}

if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = ResizeObserverFallback;
}

