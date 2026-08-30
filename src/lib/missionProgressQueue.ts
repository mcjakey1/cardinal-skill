export interface PendingMissionProgress {
  done: boolean;
  queuedAt: string;
}

export type MissionProgressQueue = Record<string, PendingMissionProgress>;

/**
 * Remove only the exact operations that reached the server. A newer tap on the
 * same mission may arrive while a flush is in flight and must stay queued.
 */
export function pruneSyncedMissionProgress(
  current: MissionProgressQueue,
  synced: readonly (readonly [string, PendingMissionProgress])[],
): MissionProgressQueue {
  const next = { ...current };
  synced.forEach(([missionId, operation]) => {
    const latest = next[missionId];
    if (latest?.done === operation.done && latest.queuedAt === operation.queuedAt) {
      delete next[missionId];
    }
  });
  return next;
}

/**
 * A successful server delete makes its local tombstone obsolete. Preserve only
 * an unmark created after the operation currently being acknowledged.
 */
export function pruneSyncedMissionUnmarks(
  current: Readonly<Record<string, string>>,
  synced: readonly (readonly [string, PendingMissionProgress])[],
): Record<string, string> {
  const next = { ...current };
  synced.forEach(([missionId, operation]) => {
    const unmarkedAt = next[missionId];
    if (!operation.done && unmarkedAt && unmarkedAt <= operation.queuedAt) {
      delete next[missionId];
    }
  });
  return next;
}
