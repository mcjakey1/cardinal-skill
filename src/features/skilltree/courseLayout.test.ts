import assert from 'node:assert/strict';
import { test } from 'node:test';

import { layoutCourseGraph } from '../../../supabase/functions/_shared/courseLayout.ts';

test('compact course layout aligns roots and centres uneven ranks', () => {
  const placed = layoutCourseGraph([
    { key: 'logic', prereq_keys: [] },
    { key: 'proof', prereq_keys: ['logic'] },
    { key: 'graphs', prereq_keys: [] },
    { key: 'colouring', prereq_keys: ['graphs'] },
    { key: 'recurrence', prereq_keys: [] },
    { key: 'algorithms', prereq_keys: ['recurrence'] },
    { key: 'synthesis', prereq_keys: ['proof', 'colouring', 'algorithms'] },
  ]);
  const at = (key: string) => placed.find((node) => node.key === key)!;

  assert.equal(at('logic').x, 0);
  assert.equal(at('graphs').x, 0);
  assert.equal(at('recurrence').x, 0);
  assert.equal(at('proof').x, 232);
  assert.equal(at('synthesis').x, 464);
  assert.equal(at('graphs').y, at('synthesis').y, 'single convergence stays on the visual centre');
  assert.equal(Math.max(...placed.map((node) => node.y)), 224);
});

test('compact course layout keeps siblings separated and prerequisites to the left', () => {
  const placed = layoutCourseGraph([
    { key: 'root', prereq_keys: [] },
    { key: 'upper', prereq_keys: ['root'] },
    { key: 'lower', prereq_keys: ['root'] },
    { key: 'end', prereq_keys: ['upper', 'lower'] },
  ]);
  const at = (key: string) => placed.find((node) => node.key === key)!;

  assert.equal(Math.abs(at('upper').y - at('lower').y), 112);
  for (const node of placed) {
    for (const parent of node.prereq_keys) {
      assert.ok(node.x > at(parent).x, `${node.key} must remain right of ${parent}`);
    }
  }
});
