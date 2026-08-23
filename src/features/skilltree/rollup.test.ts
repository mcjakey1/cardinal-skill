import assert from 'node:assert/strict';
import test from 'node:test';

import { rollUpProgress } from './rollup.ts';
import type { Mission, SkillNode } from './types.ts';

const node: SkillNode = {
  id: 'root', courseId: 'course', trackId: null, title: 'Root', description: '',
  kind: 'topic', xpReward: 50, x: 0, y: 0, sortOrder: 0,
};
const missions: Mission[] = [
  { id: 'm1', skillId: 'root', title: 'One', description: '', kind: 'topic', xpReward: 25 },
  { id: 'm2', skillId: 'root', title: 'Two', description: '', kind: 'topic', xpReward: 25 },
];

test('a mission node is never auto-mastered by an initial node status alone', () => {
  const result = rollUpProgress({
    tree: { nodes: [node], prereqs: [] },
    missions,
    completedMissionIds: [],
    directlyCompletedIds: [],
    serverMasteredIds: ['root'],
    serverXp: 0,
  });
  assert.deepEqual(result.masteredIds, []);
  assert.equal(result.xp, 0);
});

test('a mission node masters only after every mission is complete', () => {
  const result = rollUpProgress({
    tree: { nodes: [node], prereqs: [] },
    missions,
    completedMissionIds: ['m1', 'm2'],
    directlyCompletedIds: [],
    serverMasteredIds: [],
    serverXp: 0,
  });
  assert.deepEqual(result.masteredIds, ['root']);
  assert.equal(result.xp, 50);
});
