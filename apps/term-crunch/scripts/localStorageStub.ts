/**
 * In-memory `localStorage` for the headless scripts, installed by importing this
 * module BEFORE the store (ESM evaluates imports in order).
 *
 * The store's persist storage already falls back to a no-op when `localStorage`
 * is absent, but Node ships an experimental global one that warns
 * (`--localstorage-file was provided without a valid path`) and would persist a
 * playtest run to disk. A per-process stub keeps runs isolated and quiet.
 */
const memory = new Map<string, string>();

globalThis.localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  get length() {
    return memory.size;
  },
  key: (i: number) => [...memory.keys()][i] ?? null,
} as Storage;
