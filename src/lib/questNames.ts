/**
 * Names an instructor typed over the generated ones, on this device.
 *
 * `skill_nodes.title_override` is the real home for these, and `name-quest`
 * already re-checks that column at write time so an override survives a
 * regeneration in flight. Writing it needs a signed-in course owner, and auth is
 * not wired — so a rename lands here and the screen says as much. Same shape as
 * `src/lib/progress.ts`: this device's copy, kept as the offline queue once
 * there is a session to push it with.
 *
 * ponytail: one map per course through `createStore`, so the corrupt-value and
 * version rules are the ones already tested in `store.test.ts`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { normaliseOverride } from '@/features/skilltree/naming';
import { createStore } from './store';

/** node id → the title typed over it. */
export type OverrideMap = Record<string, string>;

const EMPTY: OverrideMap = {};

export function useQuestNames(courseId: string | undefined) {
  const store = useMemo(
    () =>
      courseId
        ? createStore<OverrideMap>(AsyncStorage, `cardinal.questnames.v1.${courseId}`, 1, EMPTY)
        : null,
    [courseId],
  );

  const [overrides, setOverrides] = useState<OverrideMap>(EMPTY);

  useEffect(() => {
    let live = true;
    if (!store) {
      setOverrides(EMPTY);
      return;
    }
    store.load().then((loaded) => {
      if (live) setOverrides(loaded);
    });
    return () => {
      live = false;
    };
  }, [store]);

  /** A blank name is a revert, not a node called nothing. */
  const rename = useCallback(
    async (nodeId: string, raw: string) => {
      if (!store) return;
      const name = normaliseOverride(raw);
      const next = { ...overrides };
      if (name) next[nodeId] = name;
      else delete next[nodeId];
      setOverrides(next);
      await store.save(next);
    },
    [store, overrides],
  );

  return { overrides, rename };
}
