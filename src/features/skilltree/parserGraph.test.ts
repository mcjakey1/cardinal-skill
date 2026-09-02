import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  courseGraphTopology,
  ensureSingleCourseDag,
  normalizeTieredCourseDag,
  placeSynthesisAtCourseEnd,
  requirePedagogicalCourseGraph,
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

test('only the final synthesis closes the whole course', () => {
  const nodes = placeSynthesisAtCourseEnd([
    { key: 'logic', title: 'Logic Foundations', tier: 1, prereq_keys: [] },
    { key: 'logic-synthesis', title: 'Logic Synthesis', tier: 3, prereq_keys: ['logic'] },
    { key: 'graphs', title: 'Graph Foundations', tier: 1, prereq_keys: [] },
    { key: 'network-capstone', title: 'Network Capstone', tier: 3, prereq_keys: ['graphs'] },
    {
      key: 'course-synthesis',
      title: 'Discrete Mathematics Synthesis',
      tier: 4,
      prereq_keys: ['logic-synthesis', 'network-capstone'],
    },
  ]);

  assert.deepEqual(nodes.find((node) => node.key === 'logic-synthesis')?.prereq_keys, ['logic']);
  assert.deepEqual(nodes.find((node) => node.key === 'network-capstone')?.prereq_keys, ['graphs']);
  assert.deepEqual(
    new Set(nodes.at(-1)?.prereq_keys),
    new Set(['logic-synthesis', 'network-capstone']),
  );
  assert.equal(nodes.filter((node) => node.prereq_keys.length > 2).length, 0);
});

test('a semester timeline with one cosmetic fork is rejected as too linear', () => {
  const nodes = new Array(18).fill(null).map((_, index) => ({
    key: `skill-${index + 1}`,
    prereq_keys: index === 0
      ? []
      : index === 16
      ? ['skill-15']
      : index === 17
      ? ['skill-16', 'skill-17']
      : [`skill-${index}`],
  }));

  assert.deepEqual(courseGraphTopology(nodes), {
    forks: 1,
    convergences: 1,
    longestPath: 17,
  });
  assert.throws(
    () => requirePedagogicalCourseGraph(nodes),
    /too linear.*at least 2 branch points, 2 multi-prerequisite convergences.*at most 13 skills/i,
  );
});

test('a semester graph with meaningful branches and convergence passes', () => {
  const nodes = [
    { key: 'root-a', prereq_keys: [] },
    { key: 'root-b', prereq_keys: [] },
    { key: 'a-one', prereq_keys: ['root-a'] },
    { key: 'a-two', prereq_keys: ['root-a'] },
    { key: 'b-one', prereq_keys: ['root-b'] },
    { key: 'b-two', prereq_keys: ['root-b'] },
    { key: 'a-method', prereq_keys: ['a-one'] },
    { key: 'a-analysis', prereq_keys: ['a-two'] },
    { key: 'b-method', prereq_keys: ['b-one'] },
    { key: 'b-analysis', prereq_keys: ['b-two'] },
    { key: 'a-integration', prereq_keys: ['a-method', 'a-analysis'] },
    { key: 'b-integration', prereq_keys: ['b-method', 'b-analysis'] },
    { key: 'a-application', prereq_keys: ['a-integration'] },
    { key: 'b-application', prereq_keys: ['b-integration'] },
    { key: 'comparison', prereq_keys: ['a-integration', 'b-integration'] },
    { key: 'design-a', prereq_keys: ['a-application', 'comparison'] },
    { key: 'design-b', prereq_keys: ['b-application', 'comparison'] },
    { key: 'synthesis', prereq_keys: ['design-a', 'design-b'] },
  ];

  assert.deepEqual(courseGraphTopology(nodes), {
    forks: 5,
    convergences: 6,
    longestPath: 7,
  });
  assert.doesNotThrow(() => requirePedagogicalCourseGraph(nodes));
});

test('a small sequential workshop is not forced into artificial branches', () => {
  const nodes = new Array(8).fill(null).map((_, index) => ({
    key: `workshop-${index + 1}`,
    prereq_keys: index === 0 ? [] : [`workshop-${index}`],
  }));

  assert.doesNotThrow(() => requirePedagogicalCourseGraph(nodes));
});
