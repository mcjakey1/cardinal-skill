/**
 * Versioned local storage, with the storage itself passed in.
 *
 * The web prototype reimplemented the same try/catch/JSON dance in four separate
 * files, each one silently disagreeing with the others about what to do with a
 * corrupt value. This is that pattern written once.
 *
 * Storage is a parameter rather than an import so the rules below can be tested
 * without a device: the app hands it AsyncStorage, `store.test.ts` hands it a
 * Map. Nothing here imports React or AsyncStorage.
 */

export interface StorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface Envelope<T> {
  version: number;
  value: T;
}

export interface Store<T> {
  load(): Promise<T>;
  save(value: T): Promise<void>;
  clear(): Promise<void>;
}

export function createStore<T>(
  storage: StorageLike,
  key: string,
  version: number,
  fallback: T,
): Store<T> {
  return {
    async load() {
      try {
        const raw = await storage.getItem(key);
        if (raw === null) return fallback;
        const parsed = JSON.parse(raw) as Envelope<T>;
        // A value from an older version is discarded rather than migrated.
        // Handing a caller the previous shape is worse than handing it the
        // default: the default is a working app, the old shape is a field of
        // the wrong type reaching code that never checks.
        if (parsed?.version !== version) return fallback;
        return parsed.value;
      } catch {
        return fallback;
      }
    },

    async save(value) {
      const envelope: Envelope<T> = { version, value };
      await storage.setItem(key, JSON.stringify(envelope));
    },

    async clear() {
      await storage.removeItem(key);
    },
  };
}
