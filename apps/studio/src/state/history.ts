// Undo and redo keep whole projects, one per step. The operations return a fresh copy of the project, so
// before a step is kept its unchanged parts are swapped for the previous project's own: every step then
// costs only what it changed, and React can tell what changed by identity.

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * `next`, with every part equal to the same part of `prev` replaced by `prev`'s (so `share(a, b) === a` when
 * the two are equal). Objects keep `next`'s key order. Neither input is changed.
 */
export function share<T>(prev: T, next: T): T {
  if (Object.is(prev, next)) return prev;
  if (Array.isArray(prev) && Array.isArray(next)) {
    let same = prev.length === next.length;
    const out = next.map((item, i) => {
      const shared = i < prev.length ? share(prev[i], item) : item;
      if (shared !== prev[i]) same = false;
      return shared;
    });
    return (same ? prev : out) as T;
  }
  if (isObject(prev) && isObject(next)) {
    const before = Object.keys(prev);
    const after = Object.keys(next);
    let same = before.length === after.length && before.every((key, i) => after[i] === key);
    const out: Record<string, unknown> = {};
    for (const key of after) {
      const shared = key in prev ? share(prev[key], next[key]) : next[key];
      out[key] = shared;
      if (shared !== prev[key]) same = false;
    }
    return (same ? prev : out) as T;
  }
  return next;
}

export const HISTORY_LIMIT = 200;
