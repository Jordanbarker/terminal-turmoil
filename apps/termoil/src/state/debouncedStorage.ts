import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * Creates a PersistStorage adapter that debounces writes.
 *
 * zustand calls `partialize` on *every* `set()`, so `partialize` must stay
 * cheap (a field pick). Everything expensive lives here instead: the optional
 * `serialize` transform (for termoil, the full multi-FS + Snowflake snapshot),
 * `JSON.stringify`, and the localStorage write all run at most once per
 * debounce window.
 *
 * Flushes pending writes on beforeunload and visibilitychange (hidden)
 * to prevent data loss.
 *
 * @param serialize transform applied to the partialized state at flush time.
 *                  Defaults to identity, in which case the stored `state` is
 *                  the partialized state itself.
 */
export function createDebouncedStorage<S, P = S>(
  delay = 1000,
  serialize: (state: S) => P = (state) => state as unknown as P,
): PersistStorage<S> {
  let pendingWrite: { name: string; value: StorageValue<S> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (pendingWrite) {
      const { name, value } = pendingWrite;
      pendingWrite = null;
      try {
        localStorage.setItem(
          name,
          JSON.stringify({ state: serialize(value.state), version: value.version }),
        );
      } catch (err) {
        // Quota / serialization failure: drop this write rather than crash the
        // game, but say so. A silent catch here would mean a broken serializer
        // kills autosave for the whole session with zero signal.
        console.warn("[persist] autosave flush failed:", err);
      }
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) flush();
    });
  }

  return {
    // The stored `state` is the serialized shape P, not S. zustand hands it to
    // `merge` as `unknown`, which is where it gets read back (restoreGameState).
    getItem: (name) => {
      try {
        const raw = localStorage.getItem(name);
        if (!raw) return null;
        return JSON.parse(raw) as StorageValue<S>;
      } catch (err) {
        console.warn("[persist] failed to read saved state; starting fresh:", err);
        return null;
      }
    },
    removeItem: (name) => localStorage.removeItem(name),
    setItem(name, value) {
      pendingWrite = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
  };
}
