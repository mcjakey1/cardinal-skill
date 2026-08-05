/**
 * What this device has watched the student do on each node.
 *
 * `adaptive.ts` has been in the repo unused because nothing was feeding it.
 * This is the feed: time with a node open, how often they came back to it, and
 * whether extra help has already been grafted on.
 *
 * Local only, and it stays local. These are pacing observations, not a record
 * of achievement — nothing here is a grade, nothing here is uploaded, and no
 * instructor query reads it. `src/features/skilltree/observed.ts` documents
 * exactly which of the engine's four inputs this can honestly produce.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { NO_VISIT, type Visit } from '@/features/skilltree/observed';
import { createStore } from './store';

/** node id → what has been observed on it. */
export type VisitMap = Record<string, Visit>;

const EMPTY: VisitMap = {};

/**
 * Below this, an "open" was a mis-tap or a bounce off the wrong node. Counting
 * it as a visit would inflate `attempts` for a student who is browsing the
 * chart rather than struggling with anything on it.
 */
const MIN_VISIT_MS = 2_000;

export function useSignals(courseId: string | undefined) {
  const store = useMemo(
    () =>
      courseId
        ? createStore<VisitMap>(AsyncStorage, `cardinal.signals.v1.${courseId}`, 1, EMPTY)
        : null,
    [courseId],
  );

  const [visits, setVisits] = useState<VisitMap>(EMPTY);
  // Held in a ref as well so `noteVisit` can read the current map without being
  // rebuilt on every change — it is called from an effect cleanup, and a stale
  // closure there would drop the visit it was cleaning up after.
  const latest = useRef<VisitMap>(EMPTY);

  useEffect(() => {
    let live = true;
    if (!store) {
      latest.current = EMPTY;
      setVisits(EMPTY);
      return;
    }
    store.load().then((loaded) => {
      if (!live) return;
      latest.current = loaded;
      setVisits(loaded);
    });
    return () => {
      live = false;
    };
  }, [store]);

  const write = useCallback(
    async (next: VisitMap) => {
      latest.current = next;
      setVisits(next);
      if (store) await store.save(next);
    },
    [store],
  );

  /** Called when a node's detail window closes, with how long it was open. */
  const noteVisit = useCallback(
    async (nodeId: string, ms: number) => {
      if (!store || !Number.isFinite(ms) || ms < MIN_VISIT_MS) return;
      const prev = latest.current[nodeId] ?? NO_VISIT;
      await write({
        ...latest.current,
        [nodeId]: { ...prev, attempts: prev.attempts + 1, msSpent: prev.msSpent + Math.round(ms) },
      });
    },
    [store, write],
  );

  /** Set once a help subtree has actually been grafted, so it is not offered twice. */
  const noteHelpRequested = useCallback(
    async (nodeId: string) => {
      if (!store) return;
      const prev = latest.current[nodeId] ?? NO_VISIT;
      if (prev.helpRequested) return;
      await write({ ...latest.current, [nodeId]: { ...prev, helpRequested: true } });
    },
    [store, write],
  );

  return { visits, noteVisit, noteHelpRequested };
}
