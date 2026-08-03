import assert from 'node:assert/strict';
import { test } from 'node:test';

// Explicit .ts extension: `node --test` strips types but does not resolve
// extensionless specifiers the way Metro does.
import { buildTree, deriveStatuses, levelForXp, levelProgress, nextQuests } from './progression.ts';
import type { SkillNode } from './types.ts';

function node(id: string, sortOrder: number, xpReward = 50): SkillNode {
  return {
    id,
    courseId: 'c1',
    trackId: null,
    title: id,
    description: '',
    kind: 'topic',
    xpReward,
    x: 0,
    y: 0,
    sortOrder,
  };
}

test('a node unlocks only once every prerequisite is mastered', () => {
  const tree = buildTree(
    [node('intro', 0), node('theory', 1), node('lab', 2)],
    [
      { nodeId: 'lab', prereqId: 'intro' },
      { nodeId: 'lab', prereqId: 'theory' },
    ],
  );

  const none = deriveStatuses(tree, []).status;
  assert.equal(none.get('intro'), 'available');
  assert.equal(none.get('lab'), 'locked');

  const partial = deriveStatuses(tree, ['intro']).status;
  assert.equal(partial.get('intro'), 'mastered');
  assert.equal(partial.get('lab'), 'locked', 'one of two prerequisites is not enough');

  const both = deriveStatuses(tree, ['intro', 'theory']).status;
  assert.equal(both.get('lab'), 'available');
});

test('unknown prerequisite ids are ignored rather than locking a node forever', () => {
  const tree = buildTree([node('a', 0)], [{ nodeId: 'a', prereqId: 'deleted-node' }]);
  assert.equal(deriveStatuses(tree, []).status.get('a'), 'available');
});

test('a prerequisite cycle is reported and does not hang', () => {
  const tree = buildTree(
    [node('a', 0), node('b', 1), node('downstream', 2), node('clean', 3)],
    [
      { nodeId: 'a', prereqId: 'b' },
      { nodeId: 'b', prereqId: 'a' },
      { nodeId: 'downstream', prereqId: 'a' },
    ],
  );

  const { status, cyclicNodeIds } = deriveStatuses(tree, []);
  assert.equal(status.get('a'), 'locked');
  assert.equal(status.get('b'), 'locked');
  assert.equal(status.get('downstream'), 'locked', 'depends on a node that can never unlock');
  assert.equal(status.get('clean'), 'available');
  assert.deepEqual([...cyclicNodeIds].sort(), ['a', 'b', 'downstream']);
});

test('next quests are unlocked, unfinished, and syllabus-ordered', () => {
  const tree = buildTree(
    [node('week1', 0), node('week2', 1), node('final', 9)],
    [{ nodeId: 'final', prereqId: 'week2' }],
  );

  assert.deepEqual(
    nextQuests(tree, ['week1'], 2).map((n) => n.id),
    ['week2'],
  );
});

test('levels follow the quadratic XP curve', () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(99), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(400), 3);
  assert.equal(levelForXp(-5), 1, 'negative XP is not a valid state, but must not crash');
  assert.equal(levelProgress(100), 0);
  assert.ok(levelProgress(250) > 0.4 && levelProgress(250) < 0.6);
});
