// Minimal browser stubs so the DOM/audio-free logic can be exercised under `node --test`.

export function installBrowserStubs() {
  if (!globalThis.window) globalThis.window = { devicePixelRatio: 1 };
  if (!globalThis.performance) globalThis.performance = { now: () => 0 };

  const store = new Map();
  if (!globalThis.localStorage) {
    globalThis.localStorage = {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear: () => store.clear(),
    };
  }
}

/** A canvas whose 2D context swallows every draw call. */
export function fakeCanvas() {
  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (_, prop) => (prop === 'canvas' ? canvas : noop),
    set: () => true,
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  return canvas;
}

/** Deterministic sequence generator for stubbing Math.random. */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
