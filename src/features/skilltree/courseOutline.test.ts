import assert from 'node:assert/strict';
import test from 'node:test';

import { courseOutline } from './courseOutline.ts';
import type { Mission, SkillNode, Tree } from './types.ts';

const node = (id: string, sortOrder: number): SkillNode => ({
  id, courseId: 'course', trackId: null, title: id.toUpperCase(), description: '',
  kind: 'topic', xpReward: 50, x: 0, y: 0, sortOrder,
});

// Stored out of order on purpose: the outline is study order, not row order.
const tree: Tree = {
  nodes: [node('third', 2), node('first', 0), node('second', 1)],
  prereqs: [
    { nodeId: 'second', prereqId: 'first' },
    { nodeId: 'third', prereqId: 'second' },
  ],
};

const missions: Mission[] = [
  { id: 'm1', skillId: 'second', title: 'One', description: '', kind: 'topic', xpReward: 25 },
  { id: 'm2', skillId: 'second', title: 'Two', description: '', kind: 'topic', xpReward: 25 },
];

const base = { tree, missions, completedMissionIds: [], masteredIds: [], selectedId: null };

test('nodes come back in study order, whatever order they were stored in', () => {
  const outline = courseOutline(base);
  assert.deepEqual(outline.before.map((entry) => entry.node.id), ['first', 'second', 'third']);
  assert.equal(outline.current, null);
  assert.deepEqual(outline.after, []);
});

test('positions count over the whole outline, not over each side of the split', () => {
  const outline = courseOutline({ ...base, selectedId: 'second' });
  assert.deepEqual(outline.before.map((entry) => entry.position), [1]);
  assert.equal(outline.current?.position, 2);
  assert.deepEqual(outline.after.map((entry) => entry.position), [3]);
});

test('a selection that is no longer in the tree leaves the outline whole', () => {
  const outline = courseOutline({ ...base, selectedId: 'deleted-mid-edit' });
  assert.equal(outline.current, null);
  assert.deepEqual(outline.before.map((entry) => entry.node.id), ['first', 'second', 'third']);
  assert.deepEqual(outline.after, []);
});

test('status follows the prerequisite graph and the work actually done', () => {
  const outline = courseOutline({
    ...base,
    masteredIds: ['first'],
    completedMissionIds: ['m1'],
  });
  const byId = Object.fromEntries(outline.before.map((entry) => [entry.node.id, entry.status]));
  assert.equal(byId.first, 'mastered');
  assert.equal(byId.second, 'in_progress');
  assert.equal(byId.third, 'locked');
});

test('the chart reads its meters from the same walk the outline used', () => {
  const outline = courseOutline({ ...base, completedMissionIds: ['m1'] });
  assert.equal(outline.progressByNode.second, 0.5);
  assert.equal(outline.progressByNode.first, 0);
  assert.deepEqual(Object.keys(outline.progressByNode).sort(), ['first', 'second', 'third']);
});

test('mastery is counted against this outline, not against whatever ids were passed', () => {
  const outline = courseOutline({ ...base, masteredIds: ['first', 'from-another-course'] });
  assert.equal(outline.masteredCount, 1);
  assert.equal(outline.total, 3);
});
