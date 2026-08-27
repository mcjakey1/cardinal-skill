import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type { Mission, Tree } from '@/features/skilltree/types';
import { chartDraftStorageKey } from './chartDraftKey';

export interface EditedCourse {
  tree: Tree;
  missions: Mission[];
}

export const editedTreeKey = (courseId: string) => `cardinal.edited-tree.v1.${courseId}`;

const editedCourseListeners = new Map<string, Set<(course: EditedCourse | null) => void>>();

function notifyEditedCourse(courseId: string, course: EditedCourse | null) {
  editedCourseListeners.get(courseId)?.forEach((listener) => listener(course));
}

export async function saveEditedCourseSnapshot(courseId: string, course: EditedCourse): Promise<void> {
  await AsyncStorage.setItem(editedTreeKey(courseId), JSON.stringify(course));
  notifyEditedCourse(courseId, course);
}

export function useEditedTree(
  courseId: string | undefined,
  serverNodeIds: readonly string[] | undefined,
) {
  const [edited, setEdited] = useState<EditedCourse | null>(null);
  const [ready, setReady] = useState(false);

  // Callers pass this straight from a query result, so it is a new array on
  // every render and cannot be an effect dependency: the effect would re-run,
  // JSON.parse would return a fresh object, setEdited would never be
  // reference-equal, and the render would loop forever on one AsyncStorage read
  // per turn. A string of the ids is stable by value. Derived here rather than
  // asked of the caller, who should not have to know any of this.
  const idKey = serverNodeIds?.join(' ');

  useEffect(() => {
    let live = true;
    if (!courseId) {
      setEdited(null);
      setReady(true);
      return;
    }
    AsyncStorage.getItem(editedTreeKey(courseId))
      .then((raw) => {
        if (!live) return;
        const stored = raw ? (JSON.parse(raw) as EditedCourse) : null;
        // A local edit shadows the server read, so a stale one hides a node the
        // owner retired. If the server no longer knows every node this draft
        // names, the draft is describing a chart that no longer exists.
        if (stored && idKey !== undefined) {
          const known = new Set(idKey === '' ? [] : idKey.split(' '));
          const orphaned = stored.tree.nodes.some((n) => !known.has(n.id) && !n.id.startsWith('local-'));
          if (orphaned) {
            AsyncStorage.removeItem(editedTreeKey(courseId!)).catch(() => {});
            setEdited(null);
            return;
          }
        }
        setEdited(stored);
      })
      .catch(() => {
        if (live) setEdited(null);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => { live = false; };
  }, [courseId, idKey]);

  useEffect(() => {
    if (!courseId) return;
    const listeners = editedCourseListeners.get(courseId) ?? new Set();
    listeners.add(setEdited);
    editedCourseListeners.set(courseId, listeners);
    return () => {
      listeners.delete(setEdited);
      if (listeners.size === 0) editedCourseListeners.delete(courseId);
    };
  }, [courseId]);

  const save = useCallback(async (next: EditedCourse) => {
    if (!courseId) return;
    setEdited(next);
    await saveEditedCourseSnapshot(courseId, next);
  }, [courseId]);

  const clear = useCallback(async () => {
    if (!courseId) return;
    setEdited(null);
    await AsyncStorage.removeItem(editedTreeKey(courseId));
    notifyEditedCourse(courseId, null);
  }, [courseId]);

  return { edited, ready, save, clear };
}

export async function purgeCourseCache(courseId: string): Promise<void> {
  await AsyncStorage.multiRemove([
    `cardinal.progress.v1.${courseId}`,
    `cardinal.missions.v1.${courseId}`,
    `cardinal.mission-unmarks.v1.${courseId}`,
    `cardinal.mission-sync.v1.${courseId}`,
    `cardinal.questnames.v1.${courseId}`,
    `cardinal.signals.v1.${courseId}`,
    `@cardinal_nodes_${courseId}`,
    `@cardinal_layout_${courseId}`,
    editedTreeKey(courseId),
    chartDraftStorageKey(courseId),
  ]);
}
