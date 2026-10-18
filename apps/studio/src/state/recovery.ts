// Crash recovery: a copy of the open map, kept in the browser while it has unsaved changes, so a closed tab
// or a crash loses nothing. It is never sent anywhere. The map itself is only ever saved to a file.
import { serializeProject } from '@loopweft/model';
import { isDirty, type StudioStore } from './store.ts';

export interface RecoveryCopy {
  /** The map's text, as a .loopweft file holds it. */
  text: string;
  /** The file it came from, if any. */
  name: string | null;
}

export interface RecoveryStore {
  read(): Promise<RecoveryCopy | null>;
  write(copy: RecoveryCopy): Promise<void>;
  clear(): Promise<void>;
}

/** A store in memory only: for tests, and for browsers that keep nothing. */
export function memoryRecovery(): RecoveryStore {
  let copy: RecoveryCopy | null = null;
  return {
    read: async () => copy,
    write: async (next) => {
      copy = next;
    },
    clear: async () => {
      copy = null;
    },
  };
}

const DATABASE = 'loopweft-studio';
const TABLE = 'recovery';
const KEY = 'open-map';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** The browser's IndexedDB, or (where it is missing or refused) memory only. */
export function browserRecovery(): RecoveryStore {
  if (typeof indexedDB === 'undefined') return memoryRecovery();
  let opened: Promise<IDBDatabase> | null = null;
  const database = () => {
    opened ??= new Promise((resolve, reject) => {
      const r = indexedDB.open(DATABASE, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(TABLE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return opened;
  };
  const table = async (mode: IDBTransactionMode) =>
    (await database()).transaction(TABLE, mode).objectStore(TABLE);
  const fallback = memoryRecovery();
  return {
    async read() {
      try {
        return ((await request((await table('readonly')).get(KEY))) as RecoveryCopy | undefined) ?? null;
      } catch {
        return fallback.read();
      }
    },
    async write(copy) {
      try {
        await request((await table('readwrite')).put(copy, KEY));
      } catch {
        await fallback.write(copy);
      }
    },
    async clear() {
      try {
        await request((await table('readwrite')).delete(KEY));
      } catch {
        await fallback.clear();
      }
    },
  };
}

/**
 * Keeps the recovery copy in step with the store: written a moment after each change while the map has
 * unsaved changes, cleared once it is saved. Returns a function that stops watching.
 */
export function watchRecovery(store: StudioStore, recovery: RecoveryStore, delayMs = 800): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.project === previous.project && state.saved === previous.saved) return;
    clearTimeout(timer);
    if (!isDirty(state)) {
      void recovery.clear();
      return;
    }
    timer = setTimeout(() => {
      const now = store.getState();
      if (isDirty(now))
        void recovery.write({ text: serializeProject(now.project), name: now.file?.name ?? null });
    }, delayMs);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
