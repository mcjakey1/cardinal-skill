import assert from 'node:assert/strict';
import { test } from 'node:test';

// Explicit .ts extension: `node --test` strips types but does not resolve
// extensionless specifiers the way Metro does.
import { demoMasteredIds, demoTree, demoXp } from './demoTree.ts';
import {
  buildTree,
  deriveStatuses,
  evaluateSkillUnlockState,
  getSkillEligibility,
  levelForXp,
  levelProgress,
  progressRatio,
  nextQuests,
  totalXp,
} from './progression.ts';
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

test('evaluateSkillUnlockState correctly evaluates prerequisites eligibility', () => {
  const tree = buildTree(
    [node('root', 0), node('prereq1', 1), node('prereq2', 2), node('target', 3)],
    [
      { nodeId: 'target', prereqId: 'prereq1' },
      { nodeId: 'target', prereqId: 'prereq2' },
    ],
  );

  // 1. Root node with zero prerequisites
  const rootEligibility = evaluateSkillUnlockState('root', tree, []);
  assert.equal(rootEligibility.isUnlocked, true);
  assert.equal(rootEligibility.totalPrerequisites, 0);
  assert.equal(rootEligibility.blockedReason, null);

  // 2. Skill with two prerequisites, 0 mastered
  const targetNone = evaluateSkillUnlockState('target', tree, []);
  assert.equal(targetNone.isUnlocked, false);
  assert.equal(targetNone.totalPrerequisites, 2);
  assert.equal(targetNone.incompletePrerequisites.length, 2);
  assert.equal(targetNone.nextRecommendedPrerequisiteId, 'prereq1');
  assert.match(targetNone.blockedReason!, /2 remaining prerequisites/);

  // 3. Skill with two prerequisites, 1 mastered
  const targetPartial = getSkillEligibility('target', tree, ['prereq1']);
  assert.equal(targetPartial.isUnlocked, false);
  assert.equal(targetPartial.completedPrerequisites.length, 1);
  assert.equal(targetPartial.incompletePrerequisites.length, 1);
  assert.equal(targetPartial.nextRecommendedPrerequisiteId, 'prereq2');

  // 4. Skill with two prerequisites, both mastered
  const targetFull = getSkillEligibility('target', tree, ['prereq1', 'prereq2']);
  assert.equal(targetFull.isUnlocked, true);
  assert.equal(targetFull.nextRecommendedPrerequisiteId, null);
  assert.equal(targetFull.blockedReason, null);
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

test('the demo chart starts mid-course with valid progress and no dangling prerequisites', () => {
  const ids = new Set(demoTree.nodes.map((n) => n.id));
  for (const { nodeId, prereqId } of demoTree.prereqs) {
    assert.ok(ids.has(nodeId) && ids.has(prereqId), `dangling edge ${prereqId} -> ${nodeId}`);
  }

  const { status, cyclicNodeIds } = deriveStatuses(demoTree, demoMasteredIds);
  assert.deepEqual(cyclicNodeIds, []);
  assert.deepEqual(
    new Set([...status.values()]),
    new Set(['mastered', 'available', 'locked']),
    'the showcase exposes completed, current, and future work',
  );

  const earned = demoTree.nodes
    .filter((n) => demoMasteredIds.includes(n.id))
    .reduce((sum, n) => sum + n.xpReward, 0);
  assert.ok(demoXp > earned, 'one available node carries partial mission XP');
  assert.equal(demoXp, 320);
  assert.ok(demoXp < totalXp(demoTree.nodes), 'a full meter is a boring demo');
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

test('course XP ratio normalizes against the displayed maximum', () => {
  assert.equal(progressRatio(560, 690), 560 / 690);
  assert.equal(Math.round(progressRatio(560, 690) * 10), 8);
  assert.equal(progressRatio(-10, 690), 0);
  assert.equal(progressRatio(900, 690), 1);
  assert.equal(progressRatio(10, 0), 0);
});

test('a node that requires itself is quarantined as a loop, not silently freed', () => {
  const tree = buildTree([node('x', 0), node('y', 1)], [{ nodeId: 'x', prereqId: 'x' }]);
  const { status, cyclicNodeIds } = deriveStatuses(tree, []);
  assert.equal(status.get('x'), 'locked');
  assert.deepEqual(cyclicNodeIds, ['x']);
  assert.equal(status.get('y'), 'available');
});

test('the reported cycle set does not depend on the order nodes arrive in', () => {
  const prereqs = [
    { nodeId: 'a', prereqId: 'b' },
    { nodeId: 'b', prereqId: 'a' },
    { nodeId: 'n', prereqId: 'c' },
    { nodeId: 'c', prereqId: 'a' },
  ];
  const idsFor = (order: string[]) =>
    deriveStatuses(buildTree(order.map((id, i) => node(id, i)), prereqs), []).cyclicNodeIds.sort();

  assert.deepEqual(idsFor(['a', 'b', 'n', 'c']), ['a', 'b', 'c', 'n']);
  assert.deepEqual(idsFor(['a', 'b', 'n', 'c']), idsFor(['a', 'b', 'c', 'n']));
});

test('the detail panel gives the same verdict the chart cell does', () => {
  // 1. A prerequisite id nobody kept: the chart drops it, so the panel must too.
  const dangling = buildTree([node('a', 0)], [{ nodeId: 'a', prereqId: 'deleted-node' }]);
  const danglingPanel = evaluateSkillUnlockState('a', dangling, []);
  assert.equal(deriveStatuses(dangling, []).status.get('a'), 'available');
  assert.equal(danglingPanel.isUnlocked, true);
  assert.equal(danglingPanel.totalPrerequisites, 0);
  assert.equal(danglingPanel.blockedReason, null);

  // 2. Downstream of a loop with its own prerequisite mastered: the chart locks
  //    it because it can never really be reached, and the panel has to say so.
  const looped = buildTree(
    [node('a', 0), node('b', 1), node('c', 2)],
    [
      { nodeId: 'a', prereqId: 'b' },
      { nodeId: 'b', prereqId: 'a' },
      { nodeId: 'c', prereqId: 'a' },
    ],
  );
  const loopedPanel = evaluateSkillUnlockState('c', looped, ['a']);
  assert.equal(deriveStatuses(looped, ['a']).status.get('c'), 'locked');
  assert.equal(loopedPanel.isUnlocked, false);
  assert.match(loopedPanel.blockedReason ?? '', /loop/);

  // 3. A node requiring itself: locked on both, and told why.
  const selfish = buildTree([node('x', 0), node('y', 1)], [{ nodeId: 'x', prereqId: 'x' }]);
  assert.equal(evaluateSkillUnlockState('x', selfish, []).isUnlocked, false);
  assert.match(evaluateSkillUnlockState('x', selfish, []).blockedReason ?? '', /loop/);
});
