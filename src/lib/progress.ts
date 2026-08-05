/**
 * The local completion record.
 *
 * ponytail: this is the device's copy, not the source of truth. Auth is not
 * wired yet, so "Mark complete" would otherwise be a button that does nothing —
 * which is worse than a button that writes locally. When `node_progress` is
 * reachable and the student is signed in, keep this as the offline queue and
 * push it; do not delete it, because a student on a metered connection between
 * classes is exactly who this product is for.
 *
 * Timestamps are stored, not just ids, because the streak is derived from them.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type { SkillNode } from '@/features/skilltree/types';

/** node id → ISO timestamp of the moment it was marked complete. */
export type CompletionLog = Record<string, string>;

const key = (courseId: string) => `cardinal.progress.v1.${courseId}`;

export async function loadLocal(courseId: string): Promise<CompletionLog> {
  try {
    const raw = await AsyncStorage.getItem(key(courseId));
    return raw ? (JSON.parse(raw) as CompletionLog) : {};
  } catch {
    return {};
  }
}

export async function markLocal(
  courseId: string,
  nodeId: string,
  at: Date = new Date(),
): Promise<CompletionLog> {
  const log = await loadLocal(courseId);
  if (log[nodeId]) return log;
  const next = { ...log, [nodeId]: at.toISOString() };
  await AsyncStorage.setItem(key(courseId), JSON.stringify(next));
  return next;
}

export async function clearLocal(courseId: string): Promise<void> {
  await AsyncStorage.removeItem(key(courseId));
}

export interface MergedProgress {
  masteredIds: string[];
  xp: number;
}

/**
 * Fold the local log into what the server returned.
 *
 * XP is only added for completions the server does not already know about, so a
 * node that syncs later does not get counted twice.
 */
export function mergeLocalProgress(
  nodes: SkillNode[],
  serverMasteredIds: string[],
  log: CompletionLog,
  serverXp: number,
): MergedProgress {
  const server = new Set(serverMasteredIds);
  const known = new Map(nodes.map((n) => [n.id, n] as const));

  let xp = serverXp;
  for (const id of Object.keys(log)) {
    if (server.has(id)) continue;
    const node = known.get(id);
    if (node) xp += node.xpReward;
  }

  const merged = new Set(serverMasteredIds);
  for (const id of Object.keys(log)) if (known.has(id)) merged.add(id);

  return { masteredIds: [...merged], xp };
}

/** Read/write access to one course's local log, for a screen. */
export function useLocalProgress(courseId: string | undefined) {
  const [log, setLog] = useState<CompletionLog>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    if (!courseId) {
      setReady(true);
      return;
    }
    loadLocal(courseId).then((l) => {
      if (live) {
        setLog(l);
        setReady(true);
      }
    });
    return () => {
      live = false;
    };
  }, [courseId]);

  const complete = useCallback(
    async (nodeId: string) => {
      if (!courseId) return;
      setLog(await markLocal(courseId, nodeId));
    },
    [courseId],
  );

  const reset = useCallback(async () => {
    if (!courseId) return;
    await clearLocal(courseId);
    setLog({});
  }, [courseId]);

  return { log, ready, complete, reset };
}
