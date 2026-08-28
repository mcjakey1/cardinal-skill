import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ensureSingleCourseDag,
  normalizeTieredCourseDag,
  placeSynthesisAtCourseEnd,
  validateTieredCourseDag,
} from '../../../supabase/functions/_shared/courseGraph.ts';

test('parser graph cleanup produces one connected acyclic graph', () => {
  const nodes = ensureSingleCourseDag([
    { key: 'foundations', prereq_keys: [] },
    { key: 'practice', prereq_keys: ['foundations', 'foundations', 'ghost'] },
    { key: 'independent', prereq_keys: [] },
    { key: 'later', prereq_keys: ['future'] },
    { key: 'future', prereq_keys: ['later'] },
  ]);

  const index = new Map(nodes.map((node, position) => [node.key, position]));
  const adjacency = new Map(nodes.map((node) => [node.key, new Set<string>()]));

  for (const node of nodes) {
    assert.equal(new Set(node.prereq_keys).size, node.prereq_keys.length, 'edges are unique');
    for (const parent of node.prereq_keys) {
      assert.ok(index.has(parent), `${parent} is a known node`);
      assert.ok(index.get(parent)! < index.get(node.key)!, `${parent} appears before ${node.key}`);
      adjacency.get(node.key)!.add(parent);
      adjacency.get(parent)!.add(node.key);
    }
  }

  const visited = new Set<string>();
  const pending = [nodes[0]!.key];
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (visited.has(key)) continue;
    visited.add(key);
    pending.push(...adjacency.get(key)!);
  }

  assert.equal(visited.size, nodes.length, 'every topic belongs to the same course graph');
});

test('parser graph cleanup removes redundant transitive bypass edges', () => {
  const nodes = ensureSingleCourseDag([
    { key: 'boolean-laws', prereq_keys: [] },
    { key: 'karnaugh-maps', prereq_keys: ['boolean-laws'] },
    { key: 'circuit-minimization', prereq_keys: ['boolean-laws', 'karnaugh-maps'] },
  ]);

  assert.deepEqual(nodes[2]?.prereq_keys, ['karnaugh-maps']);
});

test('four-tier parser graphs keep direct same-tier and cross-tier prerequisites', () => {
  const nodes = validateTieredCourseDag([
    { key: 'foundations', tier: 1, prereq_keys: [] },
    { key: 'method', tier: 2, prereq_keys: ['foundations'] },
    { key: 'application', tier: 3, prereq_keys: ['foundations', 'method'] },
    { key: 'advanced-application', tier: 3, prereq_keys: ['application'] },
    { key: 'synthesis', tier: 4, prereq_keys: ['advanced-application'] },
  ]);

  assert.deepEqual(nodes.map((node) => node.tier), [1, 2, 3, 3, 4]);
  assert.deepEqual(nodes[2]?.prereq_keys, ['method']);
  assert.deepEqual(nodes[3]?.prereq_keys, ['application']);
});

test('four-tier parser graphs reject orphans and backward edges', () => {
  assert.throws(() => validateTieredCourseDag([
    { key: 'foundation', tier: 1, prereq_keys: [] },
    { key: 'method', tier: 2, prereq_keys: [] },
    { key: 'application', tier: 3, prereq_keys: ['method'] },
    { key: 'synthesis', tier: 4, prereq_keys: ['application'] },
  ]), /orphan/);

  assert.throws(() => validateTieredCourseDag([
    { key: 'foundation', tier: 1, prereq_keys: ['method'] },
    { key: 'method', tier: 2, prereq_keys: ['foundation'] },
    { key: 'application', tier: 3, prereq_keys: ['method'] },
    { key: 'synthesis', tier: 4, prereq_keys: ['application'] },
  ]), /moves backward/);
});

test('a connected advanced branch may terminate before Tier 4', () => {
  const nodes = validateTieredCourseDag([
    { key: 'foundation', tier: 1, prereq_keys: [] },
    { key: 'method', tier: 2, prereq_keys: ['foundation'] },
    { key: 'terminal-application', tier: 3, prereq_keys: ['method'] },
    { key: 'synthesis', tier: 4, prereq_keys: ['method'] },
  ]);

  assert.deepEqual(nodes.find((node) => node.key === 'terminal-application')?.prereq_keys, ['method']);
});

test('parser normalization repairs orphan tiers and disconnected fragments', () => {
  const nodes = normalizeTieredCourseDag([
    { key: 'foundations', tier: 1, prereq_keys: [] },
    { key: 'method', tier: 2, prereq_keys: ['foundations'] },
    { key: 'graph-fundamentals', tier: 2, prereq_keys: [] },
    { key: 'application', tier: 1, prereq_keys: ['graph-fundamentals'] },
  ]);

  assert.deepEqual(nodes.map((node) => node.tier), [1, 2, 2, 2]);
  assert.deepEqual(nodes[2]?.prereq_keys, ['method']);
  assert.deepEqual(nodes[3]?.prereq_keys, ['graph-fundamentals']);
});

test('parser normalization clamps semantic tiers to the four-tier contract', () => {
  const nodes = normalizeTieredCourseDag([
    { key: 'foundation', tier: -4, prereq_keys: [] },
    { key: 'method', tier: 9, prereq_keys: ['foundation'] },
  ]);

  assert.deepEqual(nodes.map((node) => node.tier), [1, 4]);
});

test('a cumulative synthesis becomes the final convergence instead of an early prerequisite', () => {
  const nodes = placeSynthesisAtCourseEnd([
    { key: 'relations', title: 'Relations And Functions', tier: 1, prereq_keys: [] },
    { key: 'posets', title: 'Posets And Partitions', tier: 2, prereq_keys: ['relations'] },
    { key: 'counting', title: 'Counting Permutations', tier: 1, prereq_keys: [] },
    { key: 'combinatorics', title: 'Advanced Combinatorics', tier: 2, prereq_keys: ['counting'] },
    { key: 'synthesis', title: 'Discrete Synthesis', tier: 3, prereq_keys: ['posets', 'combinatorics'] },
    { key: 'graph-terms', title: 'Graph Terminology', tier: 2, prereq_keys: ['synthesis'] },
    { key: 'graph-representation', title: 'Graph Representation', tier: 3, prereq_keys: ['graph-terms'] },
    { key: 'recurrences', title: 'Recurrence Relations', tier: 1, prereq_keys: [] },
    { key: 'recursive-algorithms', title: 'Recursive Algorithms', tier: 3, prereq_keys: ['recurrences'] },
  ]);
  const synthesis = nodes.at(-1)!;

  assert.equal(synthesis.key, 'synthesis');
  assert.equal(synthesis.tier, 4);
  assert.deepEqual(
    new Set(synthesis.prereq_keys),
    new Set(['posets', 'combinatorics', 'graph-representation', 'recursive-algorithms']),
  );
  assert.equal(nodes.find((node) => node.key === 'graph-terms')?.prereq_keys.length, 0);
  assert.equal(nodes.some((node) => node.key !== 'synthesis' && node.prereq_keys.includes('synthesis')), false);
});

test('an advanced specialist topic is not treated as a cumulative synthesis', () => {
  const input = [
    { key: 'foundation', title: 'Graph Foundations', tier: 1, prereq_keys: [] },
    { key: 'hard-topic', title: 'Advanced Graph Coloring', tier: 4, prereq_keys: ['foundation'] },
  ];

  assert.deepEqual(placeSynthesisAtCourseEnd(input), input);
});
