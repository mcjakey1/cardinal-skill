import assert from 'node:assert/strict';
import { test } from 'node:test';

import { achievements, gradedXp, streakDays } from './achievements.ts';
import type { SkillNode, Tree } from './types.ts';

const AT = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).toISOString();
const TODAY = new Date(2026, 2, 10, 9, 0, 0); // 10 March 2026

function node(id: string, kind: SkillNode['kind'] = 'topic', xpReward = 50): SkillNode {
  return {
    id,
    courseId: 'c',
    trackId: null,
    title: id,
    description: '',
    kind,
    xpReward,
    x: 0,
    y: 0,
    sortOrder: 0,
  };
}

test('streak counts consecutive days back from today', () => {
  const log = [AT(2026, 3, 10), AT(2026, 3, 9), AT(2026, 3, 8)];
  assert.equal(streakDays(log, TODAY), 3);
});

test('a day that has not finished yet cannot break a streak', () => {
  // Nothing today, something yesterday: still a live streak.
  assert.equal(streakDays([AT(2026, 3, 9), AT(2026, 3, 8)], TODAY), 2);
});

test('a gap ends the streak', () => {
  assert.equal(streakDays([AT(2026, 3, 7), AT(2026, 3, 6)], TODAY), 0);
});

test('two completions on one day are one day of streak', () => {
  assert.equal(streakDays([AT(2026, 3, 10), AT(2026, 3, 10)], TODAY), 1);
});

test('empty and malformed logs are zero, not NaN', () => {
  assert.equal(streakDays([], TODAY), 0);
  assert.equal(streakDays(['not a date'], TODAY), 0);
});

test('achievements are earned from the chart, not stored', () => {
  const tree: Tree = {
    nodes: [node('a'), node('b'), node('c'), node('exam', 'assessment', 150)],
    prereqs: [{ nodeId: 'exam', prereqId: 'a' }],
  };

  const none = achievements(tree, [], 0);
  assert.equal(none.find((x) => x.id === 'first-clear')?.earned, false);

  const some = achievements(tree, ['a'], 0);
  assert.equal(some.find((x) => x.id === 'first-clear')?.earned, true);
  // a is done, so b, c and exam are all open at once.
  assert.equal(some.find((x) => x.id === 'path-opener')?.earned, true);
  assert.equal(some.find((x) => x.id === 'cleared')?.earned, false);

  const all = achievements(tree, ['a', 'b', 'c', 'exam'], 9);
  assert.equal(all.find((x) => x.id === 'cleared')?.earned, true);
  assert.equal(all.find((x) => x.id === 'examined')?.earned, true);
  assert.equal(all.find((x) => x.id === 'week')?.earned, true);
});

test('an achievement the chart cannot offer is never earned', () => {
  const tree: Tree = { nodes: [node('a'), node('b')], prereqs: [] };
  const earned = achievements(tree, ['a', 'b'], 0);
  const examined = earned.find((x) => x.id === 'examined');
  assert.equal(examined?.earned, false);
  assert.equal(examined?.progress, 0);
});

test('progress is clamped to 0..1', () => {
  const tree: Tree = { nodes: [node('a')], prereqs: [] };
  for (const a of achievements(tree, ['a'], 99)) {
    assert.ok(a.progress >= 0 && a.progress <= 1, `${a.id} out of range: ${a.progress}`);
  }
});

test('locked stamps expose an exact progress count for the dossier', () => {
  const sample: Tree = { nodes: [node('a'), node('b')], prereqs: [] };
  const path = achievements(sample, [], 0).find((item) => item.id === 'path-opener');
  assert.equal(path?.current, 2);
  assert.equal(path?.target, 3);
});

test('help nodes are worth XP but never count toward the graded total', () => {
  const graded = node('a');
  const help: SkillNode = { ...node('help'), graded: false, parentNodeId: 'a' };
  assert.equal(gradedXp([graded, help]), 50);
});
