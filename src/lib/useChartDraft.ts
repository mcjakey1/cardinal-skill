/**
 * The instructor's chart draft, kept on the device.
 *
 * Storage and React live here; the rules live in `chartDraft.ts`, which stays
 * importable by `node --test`. Same split as `store.ts` and `nodeLayout.ts`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  applyOp, canRedo as canRedoDraft, canUndo as canUndoDraft, emptyDraft, redo, sameNodeIds, undo,
  type ChartDraft, type ChartOp, type ChartState,
} from '@/features/skilltree/chartDraft';

import { diffCharts, isEmptyChangeSet } from '@/features/skilltree/chartDiff';

import { chartDraftStorageKey } from './chartDraftKey';
import { createStore } from './store';

const EMPTY_STATE: ChartState = { nodes: [], prereqs: [], missions: [] };
const EMPTY: ChartDraft = emptyDraft(EMPTY_STATE);

/**
 * Is the server still exactly where our publish left it?
 *
 * Deliberately stricter than the pre-publish staleness check, because the two
 * operations want opposite strictness. Publish writes a targeted diff: a
 * colleague renaming a node I never touched is not in my payload and cannot be
 * clobbered by my write, so refusing over it is friction with no safety benefit
 * — `sameNodeIds` is right there. Undo publish reverts the *whole* chart to a
 * baseline, so any drift at all is work my write would overwrite.
 *
 * `diffCharts` answers "what would publishing this take", and is the same function
 * the undo itself runs, so the withdrawal and the undo cannot disagree about
 * what counts as changed. It is not sufficient alone: it walks the target's
 * nodes, so a node the server gained since our publish is invisible to it
 * (verified — a bare added node yields an empty change set). `sameNodeIds`
 * covers exactly that gap, which is why both are here.
 */
function unmoved(publishedAt: ChartState, server: ChartState): boolean {
  return sameNodeIds(publishedAt, server) && isEmptyChangeSet(diffCharts(server, publishedAt));
}

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

  // `store` flips synchronously with `courseId`, but the effect that reloads it
  // runs after commit. Without this, one render of a course switch returns the
  // *previous* course's draft with `ready: true` — a stale draft presented as
  // loaded, which callers gate real decisions on. React's documented
  // adjust-state-while-rendering pattern, not an effect, because the correct
  // value is knowable now and a frame of the wrong one is the whole bug.
  const loadedFor = useRef(store);
  if (loadedFor.current !== store) {
    loadedFor.current = store;
    setDraft(EMPTY);
    setReady(false);
  }

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
   * Re-seed from a fresh server read, keeping the undo baseline.
   *
   * This is what the mount-time seed runs, and it runs only with no ops pending,
   * so there is never work in progress to lose. `published` has to survive it,
   * and the two obvious options are both wrong: clearing it drops Undo publish,
   * while skipping the re-seed to protect it pins the draft to a baseline that
   * never catches up with the server again — so every later change by anyone
   * else comes back as this instructor's unpublished edits.
   *
   * It survives only while it still describes something real. If the server has
   * moved past the state our publish left behind, someone else has published
   * since, and restoring our baseline would revert their work — so the undo is
   * withdrawn here and the button disappears.
   */
  const reseed = useCallback(
    (state: ChartState) => {
      const { published, publishedAt } = latest.current;
      // A draft persisted before publishedAt existed reads undefined, which
      // != null catches alongside null. Withdrawing too eagerly is the safe
      // direction: the edits are still in the draft, so the cost is re-making a
      // publish, not losing work.
      const stillOurs =
        published != null && publishedAt != null && unmoved(publishedAt, state);
      return commit({
        ...emptyDraft(state),
        published: stillOurs ? published : null,
        publishedAt: stillOurs ? publishedAt : null,
      });
    },
    [commit],
  );

  /**
   * Seed from what a publish just wrote, keeping what it replaced. `before` is
   * what Undo publish diffs back towards.
   */
  const markPublished = useCallback(
    (before: ChartState, after: ChartState) =>
      commit({ ...emptyDraft(after), published: before, publishedAt: after }),
    [commit],
  );

  return {
    draft,
    ready,
    edit,
    undoEdit,
    redoEdit,
    reset,
    reseed,
    markPublished,
    canUndo: canUndoDraft(draft),
    canRedo: canRedoDraft(draft),
  };
}
