import assert from 'node:assert/strict';
import test from 'node:test';

import { nodeProgress, rollUpProgress } from './rollup.ts';
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
    serverCompletedMissionIds: [],
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
    serverCompletedMissionIds: [],
    directlyCompletedIds: [],
    serverMasteredIds: [],
    serverXp: 0,
  });
  assert.deepEqual(result.masteredIds, ['root']);
  assert.equal(result.xp, 50);
});

test('server mission snapshots are not counted again at the editable current reward', () => {
  const result = rollUpProgress({
    tree: { nodes: [node], prereqs: [] },
    missions,
    completedMissionIds: ['m1', 'm2'],
    serverCompletedMissionIds: ['m1'],
    directlyCompletedIds: [],
    serverMasteredIds: [],
    serverXp: 10,
  });
  assert.equal(result.xp, 35);
});

test('one absurd reward cannot poison the headline XP or a node meter', () => {
  // The parser is untrusted and the roll-up feeds the level meter, so a single
  // NaN reward must not take the whole number with it.
  const dirty: Mission[] = [
    { id: 'm1', skillId: 'root', title: 'One', description: '', kind: 'topic', xpReward: 50 },
    { id: 'm2', skillId: 'root', title: 'Two', description: '', kind: 'topic', xpReward: NaN },
  ];
  const rolled = rollUpProgress({
    tree: { nodes: [node], prereqs: [] },
    missions: dirty,
    completedMissionIds: ['m1', 'm2'],
    serverCompletedMissionIds: [],
    directlyCompletedIds: [],
    serverMasteredIds: [],
    serverXp: 0,
  });
  assert.equal(rolled.xp, 50);
  assert.equal(nodeProgress(node, dirty, ['m1'], false), 1);

  // A node with no missions carries its own untrusted reward into the same sum.
  const bad: SkillNode = { ...node, id: 'bare', xpReward: Number.POSITIVE_INFINITY };
  const bareRoll = rollUpProgress({
    tree: { nodes: [bad], prereqs: [] },
    missions: [],
    completedMissionIds: [],
    serverCompletedMissionIds: [],
    directlyCompletedIds: ['bare'],
    serverMasteredIds: [],
    serverXp: 10,
  });
  assert.equal(bareRoll.xp, 10);

  // Fractional rewards are floored on both sides of the ratio, never one.
  const frac: Mission[] = [
    { id: 'f1', skillId: 'root', title: 'One', description: '', kind: 'topic', xpReward: 10.7 },
    { id: 'f2', skillId: 'root', title: 'Two', description: '', kind: 'topic', xpReward: 10.7 },
  ];
  assert.equal(nodeProgress(node, frac, ['f1'], false), 0.5);
});
