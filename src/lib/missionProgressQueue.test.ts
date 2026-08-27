import assert from 'node:assert/strict';
import test from 'node:test';

import { pruneSyncedMissionProgress, type MissionProgressQueue } from './missionProgressQueue.ts';

test('pruneSyncedMissionProgress preserves a newer operation for the same mission', () => {
  const current: MissionProgressQueue = {
    mission1: { done: false, queuedAt: '2026-08-27T10:01:00.000Z' },
    mission2: { done: true, queuedAt: '2026-08-27T10:00:00.000Z' },
  };

  assert.deepEqual(pruneSyncedMissionProgress(current, [
    ['mission1', { done: true, queuedAt: '2026-08-27T10:00:00.000Z' }],
    ['mission2', { done: true, queuedAt: '2026-08-27T10:00:00.000Z' }],
  ]), {
    mission1: { done: false, queuedAt: '2026-08-27T10:01:00.000Z' },
  });
});
