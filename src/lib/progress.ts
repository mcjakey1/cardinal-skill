/**
 * The local completion record.
 *
 * ponytail: this is the device's copy, not the source of truth. Mission changes
 * also enter a small pending-operation queue and sync under RLS when auth and
 * the network are available. Keep the local copy because a student on a metered
 * connection between classes is exactly who this product is for.
 *
 * Timestamps are stored, not just ids, because the streak is derived from them.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import {
  pruneSyncedMissionProgress,
  type MissionProgressQueue,
  type PendingMissionProgress,
} from './missionProgressQueue';
import { supabase } from './supabase';

/** node id → ISO timestamp of the moment it was marked complete. */
export type CompletionLog = Record<string, string>;

/**
 * Two logs, because they answer different questions. `nodes` records a node
 * marked complete outright — only meaningful for a node with no missions.
 * `missions` records the individual pieces of work, and is what node mastery is
 * derived from everywhere else.
 */
type Scope = 'nodes' | 'missions' | 'mission-unmarks';

const key = (scope: Scope, courseId: string) =>
  scope === 'nodes'
    ? `cardinal.progress.v1.${courseId}`
    : scope === 'missions'
      ? `cardinal.missions.v1.${courseId}`
      : `cardinal.mission-unmarks.v1.${courseId}`;

const pendingKey = (courseId: string) => `cardinal.mission-sync.v1.${courseId}`;

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
  await AsyncStorage.multiRemove([
    key('nodes', courseId),
    key('missions', courseId),
    key('mission-unmarks', courseId),
    pendingKey(courseId),
  ]);
}

async function loadPendingMissionProgress(courseId: string): Promise<MissionProgressQueue> {
  try {
    const raw = await AsyncStorage.getItem(pendingKey(courseId));
    return raw ? (JSON.parse(raw) as MissionProgressQueue) : {};
  } catch {
    return {};
  }
}

async function queueMissionProgress(courseId: string, missionId: string, done: boolean): Promise<void> {
  const pending = await loadPendingMissionProgress(courseId);
  const operation: PendingMissionProgress = { done, queuedAt: new Date().toISOString() };
  await AsyncStorage.setItem(pendingKey(courseId), JSON.stringify({ ...pending, [missionId]: operation }));
}

async function syncMissionProgress(userId: string, missionId: string, done: boolean): Promise<void> {
  const result = done
    ? await supabase.from('mission_progress').upsert({
        user_id: userId,
        mission_id: missionId,
        verified_by: 'self',
      }, { onConflict: 'user_id,mission_id' })
    : await supabase.from('mission_progress').delete().eq('mission_id', missionId);
  if (result.error) throw result.error;
}

async function syncNodeProgress(nodes: CompletionLog): Promise<void> {
  const entries = Object.entries(nodes);
  if (entries.length === 0) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { error } = await supabase.from('node_progress').upsert(
    entries.map(([nodeId, completedAt]) => ({
      user_id: data.user!.id,
      node_id: nodeId,
      status: 'mastered' as const,
      completed_at: completedAt,
      verified_by: 'self',
    })),
    { onConflict: 'user_id,node_id' },
  );
  if (error) throw error;
}

async function flushMissionProgress(courseIds: readonly string[]): Promise<void> {
  const queues = await Promise.all(courseIds.map(async (courseId) =>
    [courseId, await loadPendingMissionProgress(courseId)] as const,
  ));
  const entries = queues.flatMap(([courseId, pending]) =>
    Object.entries(pending).map(([missionId, operation]) =>
      [courseId, missionId, operation] as const,
    ),
  );
  if (entries.length === 0) return;

  const { data } = await supabase.auth.getUser();
  if (!data.user) return;

  const results = await Promise.allSettled(entries.map(([, missionId, operation]) =>
    syncMissionProgress(data.user!.id, missionId, operation.done),
  ));
  const synced = entries.filter((_, index) => results[index]?.status === 'fulfilled');
  if (synced.length === 0) return;

  await Promise.all(courseIds.map(async (courseId) => {
    const courseSynced = synced
      .filter(([syncedCourseId]) => syncedCourseId === courseId)
      .map(([, missionId, operation]) => [missionId, operation] as const);
    if (courseSynced.length === 0) return;
    const latest = await loadPendingMissionProgress(courseId);
    await AsyncStorage.setItem(
      pendingKey(courseId),
      JSON.stringify(pruneSyncedMissionProgress(latest, courseSynced)),
    );
  }));
}

/** Read/write access to one course's local logs, for a screen. */
export function useLocalProgress(courseId: string | undefined) {
  const [log, setLog] = useState<CompletionLog>({});
  const [missionLog, setMissionLog] = useState<CompletionLog>({});
  const [missionUnmarks, setMissionUnmarks] = useState<CompletionLog>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    setReady(false);
    if (!courseId) {
      setReady(true);
      return;
    }
    Promise.all([
      loadLocal(courseId, 'nodes'),
      loadLocal(courseId, 'missions'),
      loadLocal(courseId, 'mission-unmarks'),
    ]).then(
      ([nodes, missions, unmarks]) => {
        if (!live) return;
        setLog(nodes);
        setMissionLog(missions);
        setMissionUnmarks(unmarks);
        void syncNodeProgress(nodes).catch(() => {});
        void flushMissionProgress([courseId]);
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
      const nodes = await markLocal(courseId, nodeId, 'nodes');
      setLog(nodes);
      await syncNodeProgress({ [nodeId]: nodes[nodeId]! }).catch(() => {});
    },
    [courseId],
  );

  const toggleMission = useCallback(
    async (missionId: string, done: boolean) => {
      if (!courseId) return;
      if (done) {
        const [missions, unmarks] = await Promise.all([
          markLocal(courseId, missionId, 'missions'),
          unmarkLocal(courseId, missionId, 'mission-unmarks'),
        ]);
        setMissionLog(missions);
        setMissionUnmarks(unmarks);
      } else {
        const [missions, unmarks] = await Promise.all([
          unmarkLocal(courseId, missionId, 'missions'),
          markLocal(courseId, missionId, 'mission-unmarks'),
        ]);
        setMissionLog(missions);
        setMissionUnmarks(unmarks);
      }
      await queueMissionProgress(courseId, missionId, done);
      await flushMissionProgress([courseId]).catch(() => {});
    },
    [courseId],
  );

  const reset = useCallback(async () => {
    if (!courseId) return;
    await clearLocal(courseId);
    setLog({});
    setMissionLog({});
    setMissionUnmarks({});
  }, [courseId]);

  return { log, missionLog, missionUnmarks, ready, complete, toggleMission, reset };
}

export interface CourseCompletionLogs {
  nodes: CompletionLog;
  missions: CompletionLog;
  missionUnmarks: CompletionLog;
}

/** One hook for the aggregated Missions view; hook calls never depend on course count. */
export function useMultiCourseProgress(courseIds: readonly string[]) {
  const idKey = courseIds.join(' ');
  const [logs, setLogs] = useState<Record<string, CourseCompletionLogs>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    const ids = idKey ? idKey.split(' ') : [];
    setReady(false);
    Promise.all(ids.map(async (courseId) => {
      const [nodes, missions, missionUnmarks] = await Promise.all([
        loadLocal(courseId, 'nodes'),
        loadLocal(courseId, 'missions'),
        loadLocal(courseId, 'mission-unmarks'),
      ]);
      return [courseId, { nodes, missions, missionUnmarks }] as const;
    })).then((entries) => {
      if (!live) return;
      setLogs(Object.fromEntries(entries));
      void syncNodeProgress(Object.assign({}, ...entries.map(([, value]) => value.nodes))).catch(() => {});
      void flushMissionProgress(ids);
      setReady(true);
    });
    return () => { live = false; };
  }, [idKey]);

  const toggleMission = useCallback(async (courseId: string, missionId: string, done: boolean) => {
    const [missions, missionUnmarks] = done
      ? await Promise.all([
          markLocal(courseId, missionId, 'missions'),
          unmarkLocal(courseId, missionId, 'mission-unmarks'),
        ])
      : await Promise.all([
          unmarkLocal(courseId, missionId, 'missions'),
          markLocal(courseId, missionId, 'mission-unmarks'),
        ]);
    setLogs((current) => ({
      ...current,
      [courseId]: {
        nodes: current[courseId]?.nodes ?? {},
        missions,
        missionUnmarks,
      },
    }));
    await queueMissionProgress(courseId, missionId, done);
    await flushMissionProgress([courseId]).catch(() => {});
  }, []);

  return { logs, ready, toggleMission };
}
