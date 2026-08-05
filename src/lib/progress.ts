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

/** node id → ISO timestamp of the moment it was marked complete. */
export type CompletionLog = Record<string, string>;

/**
 * Two logs, because they answer different questions. `nodes` records a node
 * marked complete outright — only meaningful for a node with no missions.
 * `missions` records the individual pieces of work, and is what node mastery is
 * derived from everywhere else.
 */
type Scope = 'nodes' | 'missions';

const key = (scope: Scope, courseId: string) =>
  scope === 'nodes' ? `cardinal.progress.v1.${courseId}` : `cardinal.missions.v1.${courseId}`;

export async function loadLocal(courseId: string, scope: Scope = 'nodes'): Promise<CompletionLog> {
  try {
    const raw = await AsyncStorage.getItem(key(scope, courseId));
    return raw ? (JSON.parse(raw) as CompletionLog) : {};
  } catch {
    return {};
  }
}

export async function markLocal(
  courseId: string,
  id: string,
  scope: Scope = 'nodes',
  at: Date = new Date(),
): Promise<CompletionLog> {
  const log = await loadLocal(courseId, scope);
  if (log[id]) return log;
  const next = { ...log, [id]: at.toISOString() };
  await AsyncStorage.setItem(key(scope, courseId), JSON.stringify(next));
  return next;
}

/** Undo. A student who ticked the wrong mission should not have to live with it. */
export async function unmarkLocal(
  courseId: string,
  id: string,
  scope: Scope = 'nodes',
): Promise<CompletionLog> {
  const log = await loadLocal(courseId, scope);
  if (!log[id]) return log;
  const next = { ...log };
  delete next[id];
  await AsyncStorage.setItem(key(scope, courseId), JSON.stringify(next));
  return next;
}

export async function clearLocal(courseId: string): Promise<void> {
  await AsyncStorage.multiRemove([key('nodes', courseId), key('missions', courseId)]);
}

/** Read/write access to one course's local logs, for a screen. */
export function useLocalProgress(courseId: string | undefined) {
  const [log, setLog] = useState<CompletionLog>({});
  const [missionLog, setMissionLog] = useState<CompletionLog>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    if (!courseId) {
      setReady(true);
      return;
    }
    Promise.all([loadLocal(courseId, 'nodes'), loadLocal(courseId, 'missions')]).then(
      ([nodes, missions]) => {
        if (!live) return;
        setLog(nodes);
        setMissionLog(missions);
        setReady(true);
      },
    );
    return () => {
      live = false;
    };
  }, [courseId]);

  const complete = useCallback(
    async (nodeId: string) => {
      if (!courseId) return;
      setLog(await markLocal(courseId, nodeId, 'nodes'));
    },
    [courseId],
  );

  const toggleMission = useCallback(
    async (missionId: string, done: boolean) => {
      if (!courseId) return;
      setMissionLog(
        done
          ? await markLocal(courseId, missionId, 'missions')
          : await unmarkLocal(courseId, missionId, 'missions'),
      );
    },
    [courseId],
  );

  const reset = useCallback(async () => {
    if (!courseId) return;
    await clearLocal(courseId);
    setLog({});
    setMissionLog({});
  }, [courseId]);

  return { log, missionLog, ready, complete, toggleMission, reset };
}
