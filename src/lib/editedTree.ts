import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type { Mission, Tree } from '@/features/skilltree/types';
import { chartDraftStorageKey } from './chartDraftKey';

export interface EditedCourse {
  tree: Tree;
  missions: Mission[];
}

export const editedTreeKey = (courseId: string) => `cardinal.edited-tree.v1.${courseId}`;

export function useEditedTree(courseId: string | undefined) {
  const [edited, setEdited] = useState<EditedCourse | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    if (!courseId) {
      setEdited(null);
      setReady(true);
      return;
    }
    AsyncStorage.getItem(editedTreeKey(courseId))
      .then((raw) => {
        if (live) setEdited(raw ? JSON.parse(raw) as EditedCourse : null);
      })
      .catch(() => {
        if (live) setEdited(null);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => { live = false; };
  }, [courseId]);

  const save = useCallback(async (next: EditedCourse) => {
    if (!courseId) return;
    setEdited(next);
    await AsyncStorage.setItem(editedTreeKey(courseId), JSON.stringify(next));
  }, [courseId]);

  const clear = useCallback(async () => {
    if (!courseId) return;
    setEdited(null);
    await AsyncStorage.removeItem(editedTreeKey(courseId));
  }, [courseId]);

  return { edited, ready, save, clear };
}

export async function purgeCourseCache(courseId: string): Promise<void> {
  await AsyncStorage.multiRemove([
    `cardinal.progress.v1.${courseId}`,
    `cardinal.missions.v1.${courseId}`,
    `cardinal.questnames.v1.${courseId}`,
    `cardinal.signals.v1.${courseId}`,
    `@cardinal_nodes_${courseId}`,
    `@cardinal_layout_${courseId}`,
    editedTreeKey(courseId),
    chartDraftStorageKey(courseId),
  ]);
}
