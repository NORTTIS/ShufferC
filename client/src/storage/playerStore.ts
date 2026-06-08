export interface PlayerStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createMemoryStore(seed: Record<string, string> = {}): PlayerStore {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    get: (k) => (map.has(k) ? (map.get(k) as string) : null),
    set: (k, v) => { map.set(k, v); },
    remove: (k) => { map.delete(k); },
  };
}

function createWebStore(): PlayerStore {
  return {
    get: (k) => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v),
    remove: (k) => localStorage.removeItem(k),
  };
}

/** Web → localStorage; everywhere else → in-memory (non-persistent). */
export function createPlayerStore(): PlayerStore {
  if (typeof localStorage !== 'undefined') return createWebStore();
  return createMemoryStore();
}
