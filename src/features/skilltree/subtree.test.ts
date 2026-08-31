import assert from 'node:assert/strict';
import { test } from 'node:test';

// Explicit .ts extension: `node --test` strips types but does not resolve
// extensionless specifiers the way Metro does.
import { demoMasteredIds, demoTree } from './demoTree.ts';
import { deriveStatuses, totalXp } from './progression.ts';
import { buildHelpSubtree, fragmentXp, HELP_SHARE, xpBreakdown } from './subtree.ts';
import type { HelpStep, SkillNode } from './types.ts';

function parentNode(xpReward = 100): SkillNode {
  return {
    id: 'probability',
    courseId: 'c1',
    trackId: null,
    title: 'Probability',
    description: 'Events, independence, and conditional probability.',
    kind: 'topic',
    xpReward,
    x: 150,
    y: 65,
    sortOrder: 3,
  };
}

function step(key: string, prereqKeys: string[] = []): HelpStep {
  return { key, title: `Step ${key}`, description: '', kind: 'topic', prereqKeys };
}

const mint = (key: string) => `help-${key}`;

test('fragmenting XP conserves it exactly, for every input', () => {
  // Legal rewards: `xp_reward` is a non-negative integer, 0–10000.
  const rewards = [0, 1, 2, 3, 5, 7, 10, 13, 49, 50, 51, 99, 100, 137, 999, 10000];
  // Degenerate rewards a bad parser or a caller bug can produce.
  const badRewards = [-1, -50, -0.5, 2.7, NaN, Infinity, -Infinity];
  const stepCounts = [0, 1, 2, 3, 4, 5, 7, 11, -3, 2.9, NaN, Infinity];

  for (const reward of [...rewards, ...badRewards]) {
    for (const stepCount of stepCounts) {
      const where = `reward=${reward} steps=${stepCount}`;
      const result = fragmentXp(reward, stepCount);
      const sum = result.stepRewards.reduce((a, b) => a + b, 0);

      assert.ok(Number.isInteger(result.parentReward), `parent is an integer (${where})`);
      assert.ok(result.parentReward >= 0, `parent is never negative (${where})`);
      for (const value of result.stepRewards) {
        assert.ok(Number.isInteger(value) && value >= 0, `step reward is a whole XP (${where})`);
      }

      // The invariant: the pieces sum back to the whole, so requesting help
      // redistributes XP and never mints it.
      const expected = Number.isFinite(reward) && reward > 0 ? Math.floor(reward) : 0;
      assert.equal(result.parentReward + sum, expected, `XP is conserved (${where})`);
      if (rewards.includes(reward)) {
        assert.equal(result.parentReward + sum, reward, `no drift on a legal reward (${where})`);
      }
    }
  }
});

test('a degenerate step count leaves the parent alone', () => {
  for (const stepCount of [0, -1, -99, NaN]) {
    assert.deepEqual(fragmentXp(250, stepCount), { parentReward: 250, stepRewards: [] });
  }
});

test('help steps take roughly HELP_SHARE of the parent, remainder on the parent', () => {
  const { parentReward, stepRewards } = fragmentXp(100, 3);
  assert.deepEqual(stepRewards, [13, 13, 13]);
  assert.equal(parentReward, 61);
  const moved = 100 - parentReward;
  assert.ok(moved <= Math.ceil(100 * HELP_SHARE), 'never moves more than the share');
});

test('a help subtree is supplemental, chained, and leads back to the parent', () => {
  const parent = parentNode(100);
  const { nodes, prereqs, parentPatch } = buildHelpSubtree(
    parent,
    [step('a'), step('b', ['a']), step('c', ['b'])],
    mint,
  );

  assert.deepEqual(
    nodes.map((n) => n.id),
    ['help-a', 'help-b', 'help-c'],
  );
  for (const node of nodes) {
    assert.equal(node.parentNodeId, parent.id);
    assert.equal(node.graded, false, 'help XP must never reach a grade');
    assert.equal(node.courseId, parent.courseId);
    assert.equal(node.trackId, parent.trackId);
  }

  // Conservation again, this time through the whole build.
  const moved = nodes.reduce((sum, n) => sum + n.xpReward, 0);
  assert.equal(parentPatch.id, parent.id);
  assert.equal(parentPatch.xpReward + moved, parent.xpReward);

  assert.deepEqual(prereqs, [
    { nodeId: 'help-b', prereqId: 'help-a' },
    { nodeId: 'help-c', prereqId: 'help-b' },
    { nodeId: 'probability', prereqId: 'help-c' },
  ]);

  // The steps have to be visible as separate marks on the chart.
  const points = new Set([...nodes, parent].map((n) => `${n.x},${n.y}`));
  assert.equal(points.size, nodes.length + 1, 'no two nodes share a coordinate');
});

test('untrusted step keys are dropped rather than allowed to build a cycle', () => {
  const parent = parentNode(100);
  const minted: string[] = [];
  const { nodes, prereqs } = buildHelpSubtree(
    parent,
    [
      step('a', ['ghost', 'a']), // names a step that does not exist, and itself
      step('b', ['c']), // forward reference: 'c' is declared after 'b'
      step('c', ['b']),
      step('a'), // duplicate key
      step(''), // blank key
    ],
    (key) => {
      minted.push(key);
      return mint(key);
    },
  );

  assert.deepEqual(minted, ['a', 'b', 'c'], 'one id per usable key, no duplicates or blanks');
  assert.deepEqual(
    prereqs,
    [
      { nodeId: 'help-c', prereqId: 'help-b' },
      { nodeId: 'probability', prereqId: 'help-a' },
      { nodeId: 'probability', prereqId: 'help-c' },
    ],
    'the self, forward, and unknown references are gone',
  );

  const merged = {
    nodes: [...nodes, parent],
    prereqs,
  };
  assert.deepEqual(
    deriveStatuses(merged, []).cyclicNodeIds,
    [],
    'a student who asked for help must never be handed a permanently locked node',
  );
});

test('fragmenting a node does not change what the tree is worth', () => {
  const parent = demoTree.nodes.find((n) => n.id === 'direct-proofs')!;
  const sub = buildHelpSubtree(parent, [step('a'), step('b', ['a'])], mint);

  const tree = {
    nodes: [
      ...demoTree.nodes.map((n) =>
        n.id === sub.parentPatch.id ? { ...n, xpReward: sub.parentPatch.xpReward } : n,
      ),
      ...sub.nodes,
    ],
    prereqs: [...demoTree.prereqs, ...sub.prereqs],
  };

  const before = totalXp(demoTree.nodes);
  const after = xpBreakdown(tree, demoMasteredIds);
  assert.equal(after.available, before, 'the ceiling is the same tree, help or no help');
  assert.equal(after.supplemental.available, sub.nodes[0]!.xpReward * 2);
  assert.equal(after.graded.available, before - after.supplemental.available);
  const masteredXp = demoTree.nodes
    .filter((node) => demoMasteredIds.includes(node.id))
    .reduce((total, node) => total + node.xpReward, 0);
  assert.equal(after.earned, masteredXp);
  assert.equal(after.supplemental.earned, 0, 'no help step is finished yet');

  const withHelp = xpBreakdown(tree, [...demoMasteredIds, 'help-a']);
  assert.equal(withHelp.supplemental.earned, sub.nodes[0]!.xpReward);
  assert.equal(withHelp.available, before, 'finishing a help step still cannot raise the ceiling');
});
