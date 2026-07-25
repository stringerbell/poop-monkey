// localStorage-backed progression. Everything the player keeps between nights.

const KEY = 'poop-monkey-save-v1';

export function defaultSave() {
  return {
    level: 1,
    coins: 0,
    weapon: 0,
    equipped: 'none',
    owned: ['none'],
    upgrades: { speed: 0, stealth: 0, capacity: 0, power: 0, digest: 0 },
    totalHits: 0,
    bestNight: 0,
    completed: false,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Merge over defaults so older saves survive new fields.
    const base = defaultSave();
    return {
      ...base, ...data,
      upgrades: { ...base.upgrades, ...(data.upgrades || {}) },
      owned: Array.isArray(data.owned) && data.owned.length ? data.owned : base.owned,
    };
  } catch {
    return null;
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* private browsing — just play on without persistence */ }
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
