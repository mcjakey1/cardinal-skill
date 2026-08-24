/**
 * The instructor's chart draft, kept on the device.
 *
 * Storage and React live here; the rules live in `chartDraft.ts`, which stays
 * importable by `node --test`. Same split as `store.ts` and `nodeLayout.ts`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  applyOp, canRedo as canRedoDraft, canUndo as canUndoDraft, emptyDraft, redo, undo,
  type ChartDraft, type ChartOp, type ChartState,
} from '@/features/skilltree/chartDraft';

import { chartDraftStorageKey } from './chartDraftKey';
import { createStore } from './store';

const EMPTY_STATE: ChartState = { nodes: [], prereqs: [], missions: [] };
const EMPTY: ChartDraft = emptyDraft(EMPTY_STATE);

export function useChartDraft(courseId: string | undefined) {
  const store = useMemo(
    () =>
      courseId
        ? createStore<ChartDraft>(AsyncStorage, chartDraftStorageKey(courseId), 1, EMPTY)
        : null,
    [courseId],
  );

  const [draft, setDraft] = useState<ChartDraft>(EMPTY);
  const [ready, setReady] = useState(false);

  // Mutators fire in quick succession from canvas gestures, so they read the
  // latest draft from a ref rather than closing over a stale render.
  const latest = useRef(draft);
  latest.current = draft;

  useEffect(() => {
    let live = true;
    if (!store) {
      setDraft(EMPTY);
      setReady(true);
      return;
    }
    setReady(false);
    store.load().then((loaded) => {
      if (!live) return;
      setDraft(loaded);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [store]);

  const commit = useCallback(
    async (next: ChartDraft) => {
      setDraft(next);
      if (store) await store.save(next);
    },
    [store],
  );

  const edit = useCallback((op: ChartOp) => commit(applyOp(latest.current, op)), [commit]);
  const undoEdit = useCallback(() => commit(undo(latest.current)), [commit]);
  const redoEdit = useCallback(() => commit(redo(latest.current)), [commit]);

  /** Seed from a fresh server read. Discards the working copy and the stack. */
  const reset = useCallback((state: ChartState) => commit(emptyDraft(state)), [commit]);

  /**
   * Seed from what a publish just wrote, keeping what it replaced. `before` is
   * what Undo publish diffs back towards.
   */
  const markPublished = useCallback(
    (before: ChartState, after: ChartState) =>
      commit({ ...emptyDraft(after), published: before }),
    [commit],
  );

  return {
    draft,
    ready,
    edit,
    undoEdit,
    redoEdit,
    reset,
    markPublished,
    canUndo: canUndoDraft(draft),
    canRedo: canRedoDraft(draft),
  };
}
