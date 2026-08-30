import assert from 'node:assert/strict';
import test from 'node:test';

import { applyMissionUpdate, type MissionUpdate } from './missionEditing.ts';
import type { TreeSnapshot } from './queries.ts';

const snapshot: TreeSnapshot = {
  title: 'Course', masteredIds: [], completedMissionIds: [], xp: 0,
  tree: {
    nodes: [{
      id: 'node', courseId: 'course', trackId: null, title: 'Node', description: '',
      kind: 'topic', xpReward: 50, x: 0, y: 0, sortOrder: 0,
    }],
    prereqs: [],
  },
  missions: [
    { id: 'one', skillId: 'node', title: 'One', description: '', kind: 'topic', xpReward: 20 },
    { id: 'two', skillId: 'node', title: 'Two', description: '', kind: 'topic', xpReward: 30 },
  ],
};

test('mission edits update the mission and its parent node total in one local snapshot', () => {
  const update: MissionUpdate = {
    id: 'one', skillId: 'node', title: 'First Mission', description: 'Updated',
    xpReward: 70, estimatedMinutes: 25, difficulty: 'hard',
  };
  const next = applyMissionUpdate(snapshot, update);
  assert.equal(next.missions[0]?.title, 'First Mission');
  assert.equal(next.missions[0]?.difficulty, 'hard');
  assert.equal(next.tree.nodes[0]?.xpReward, 100);
  assert.equal(snapshot.tree.nodes[0]?.xpReward, 50, 'the cached source remains immutable');
});
