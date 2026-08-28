import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nodeChoices } from './nodeFinder.ts';
import type { SkillNode } from './types.ts';

const node = (over: Partial<SkillNode> & { id: string; title: string }): SkillNode => ({
  courseId: 'c1',
  trackId: null,
  description: '',
  kind: 'topic',
  xpReward: 50,
  x: 0,
  y: 0,
  sortOrder: 0,
  ...over,
});

const chart: SkillNode[] = [
  node({ id: 'c', title: 'Sampling' }),
  node({ id: 'a', title: 'Distributions', questTitle: 'The Bell Curve' }),
  node({ id: 'b', title: 'Chapters 1-2', titleOverride: 'Assigned reading' }),
];

test('the list is alphabetical by the name the chart shows', () => {
  assert.deepEqual(
    nodeChoices(chart, '').map((choice) => choice.title),
    ['Assigned reading', 'Sampling', 'The Bell Curve'],
  );
});

test('an override is findable by the name that replaced the syllabus one', () => {
  assert.deepEqual(nodeChoices(chart, 'assigned').map((c) => c.id), ['b']);
  // The replaced syllabus title must not match, or the row that comes back
  // carries a name the searcher never typed and looks like a different node.
  assert.deepEqual(nodeChoices(chart, 'Chapters'), []);
});

test('search ignores case and matches inside a name', () => {
  assert.deepEqual(nodeChoices(chart, 'BELL').map((c) => c.id), ['a']);
  assert.deepEqual(nodeChoices(chart, '  pling ').map((c) => c.id), ['c']);
});

test('an empty chart and an unmatched search both return nothing to show', () => {
  assert.deepEqual(nodeChoices([], 'anything'), []);
  assert.deepEqual(nodeChoices(chart, 'calculus'), []);
});
