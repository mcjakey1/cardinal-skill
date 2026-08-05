/**
 * Where a person has dragged each node, on this device.
 *
 * `skill_nodes.x/y` is the authored layout and belongs to the course owner —
 * 0002 closed writes on that table to them for exactly this kind of reason. So a
 * drag here is a personal arrangement of someone else's chart, not an edit of
 * it: it is kept locally and never pushed. An instructor rearranging the real
 * layout is a different feature, and it goes through the same owner-gated write
 * `/author` uses.
 *
 * Only moved nodes are stored. A node absent from the map sits where the
 * syllabus put it, so a re-parsed course still lands somewhere sensible instead
 * of inheriting stale coordinates for nodes that no longer exist.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { createStore } from './store';

export interface NodePosition {
  x: number;
  y: number;
}

/** node id → where it was dragged to, in tree coordinates. */
export type PositionMap = Record<string, NodePosition>;

const EMPTY: PositionMap = {};

export function useNodeLayout(courseId: string | undefined) {
  const store = useMemo(
    () =>
      courseId
        ? createStore<PositionMap>(AsyncStorage, `cardinal.layout.v1.${courseId}`, 1, EMPTY)
        : null,
    [courseId],
  );

  const [positions, setPositions] = useState<PositionMap>(EMPTY);

  useEffect(() => {
    let live = true;
    if (!store) {
      setPositions(EMPTY);
      return;
    }
    store.load().then((loaded) => {
      if (live) setPositions(loaded);
    });
    return () => {
      live = false;
    };
  }, [store]);

  /**
   * Called once when a drag ends, not on every frame of it. The dragged node
   * follows the finger through local state inside the chart; this is the commit.
   */
  const moveNode = useCallback(
    async (nodeId: string, at: NodePosition) => {
      if (!store || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const next = { ...positions, [nodeId]: { x: Math.round(at.x), y: Math.round(at.y) } };
      setPositions(next);
      await store.save(next);
    },
    [store, positions],
  );

  /** Back to the layout the syllabus described. */
  const resetLayout = useCallback(async () => {
    if (!store) return;
    setPositions(EMPTY);
    await store.clear();
  }, [store]);

  return { positions, moveNode, resetLayout, moved: Object.keys(positions).length };
}
