import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createStore, type StorageLike } from './store.ts';

/** An in-memory stand-in for AsyncStorage, so these rules can be tested off-device. */
function memoryStorage(seed: Record<string, string> = {}): StorageLike & { raw: Map<string, string> } {
  const raw = new Map(Object.entries(seed));
  return {
    raw,
    async getItem(key) {
      return raw.get(key) ?? null;
    },
    async setItem(key, value) {
      raw.set(key, value);
    },
    async removeItem(key) {
      raw.delete(key);
    },
  };
}

interface Prefs {
  pace: string;
  reminders: boolean;
}

const FALLBACK: Prefs = { pace: 'balanced', reminders: false };

test('what goes in comes back out', async () => {
  const store = createStore<Prefs>(memoryStorage(), 'prefs', 1, FALLBACK);

  await store.save({ pace: 'daily', reminders: true });

  assert.deepEqual(await store.load(), { pace: 'daily', reminders: true });
});

test('nothing stored yet reads as the fallback', async () => {
  const store = createStore<Prefs>(memoryStorage(), 'prefs', 1, FALLBACK);

  assert.deepEqual(await store.load(), FALLBACK);
});

test('a corrupt value reads as the fallback instead of throwing', async () => {
  const store = createStore<Prefs>(
    memoryStorage({ prefs: '{ this is not json' }),
    'prefs',
    1,
    FALLBACK,
  );

  assert.deepEqual(await store.load(), FALLBACK);
});

test('a value written by an older version is discarded, not misread', async () => {
  // v1 stored a pace as a number; v2 expects a string. Reading the old shape
  // would hand every caller a field of the wrong type.
  const stored = JSON.stringify({ version: 1, value: { pace: 3, reminders: true } });
  const store = createStore<Prefs>(memoryStorage({ prefs: stored }), 'prefs', 2, FALLBACK);

  assert.deepEqual(await store.load(), FALLBACK);
});

test('storage that throws on read is survivable', async () => {
  const hostile: StorageLike = {
    async getItem() {
      throw new Error('device storage unavailable');
    },
    async setItem() {},
    async removeItem() {},
  };
  const store = createStore<Prefs>(hostile, 'prefs', 1, FALLBACK);

  assert.deepEqual(await store.load(), FALLBACK);
});

test('clearing returns the store to its fallback', async () => {
  const storage = memoryStorage();
  const store = createStore<Prefs>(storage, 'prefs', 1, FALLBACK);

  await store.save({ pace: 'daily', reminders: true });
  await store.clear();

  assert.deepEqual(await store.load(), FALLBACK);
  assert.equal(storage.raw.has('prefs'), false, 'clearing removes the key, not just its contents');
});
