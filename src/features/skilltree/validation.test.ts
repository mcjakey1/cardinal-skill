import assert from 'node:assert/strict';
import { test } from 'node:test';

import { slugId, validateGraph } from './validation.ts';
import type { Prereq, SkillNode } from './types.ts';

function node(id: string): SkillNode {
  return {
    id,
    courseId: 'c',
    trackId: null,
    title: id,
    description: '',
    kind: 'topic',
    xpReward: 50,
    x: 0,
    y: 0,
    sortOrder: 0,
  };
}

test('two nodes sharing an id are reported as a duplicate', () => {
  const result = validateGraph([node('a'), node('a')], []);

  assert.equal(result.isValid, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]!.type, 'duplicate_id');
  assert.match(result.errors[0]!.message, /a/);
});

test('a prerequisite pointing at a node that does not exist is reported', () => {
  const prereqs: Prereq[] = [{ nodeId: 'b', prereqId: 'ghost' }];
  const result = validateGraph([node('a'), node('b')], prereqs);

  assert.equal(result.isValid, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]!.type, 'missing_prerequisite');
  assert.match(result.errors[0]!.message, /ghost/);
  assert.deepEqual(result.errors[0]!.nodeIds, ['b']);
});

test('a prerequisite cycle is reported once, naming everyone on it', () => {
  const prereqs: Prereq[] = [
    { nodeId: 'b', prereqId: 'a' },
    { nodeId: 'c', prereqId: 'b' },
    { nodeId: 'a', prereqId: 'c' },
  ];
  const result = validateGraph([node('a'), node('b'), node('c')], prereqs);

  const cycles = result.errors.filter((e) => e.type === 'cycle_detected');
  assert.equal(result.isValid, false);
  assert.equal(cycles.length, 1, 'one cycle is one error, not one per node');
  assert.deepEqual([...cycles[0]!.nodeIds].sort(), ['a', 'b', 'c']);
});

test('a node that requires itself is a cycle', () => {
  const result = validateGraph([node('a')], [{ nodeId: 'a', prereqId: 'a' }]);

  assert.equal(result.isValid, false);
  assert.equal(result.errors[0]!.type, 'cycle_detected');
});

test('a title becomes a readable id', () => {
  assert.equal(slugId('Describing data', new Set()), 'describing_data');
  assert.equal(slugId('Chapters 1–2', new Set()), 'chapters_1_2');
  assert.equal(slugId('  Probability!  ', new Set()), 'probability');
});

test('an id that is already taken gets a suffix, not a collision', () => {
  const taken = new Set(['probability']);
  assert.equal(slugId('Probability', taken), 'probability_2');

  taken.add('probability_2');
  assert.equal(slugId('Probability', taken), 'probability_3');
});

test('a title with nothing usable in it still yields an id', () => {
  assert.equal(slugId('—', new Set()), 'node');
  assert.equal(slugId('', new Set()), 'node');
});

test('a very long title is truncated', () => {
  const id = slugId('a'.repeat(80), new Set());
  assert.equal(id.length, 32);
});

test('a clean graph reports nothing', () => {
  const result = validateGraph([node('a'), node('b')], [{ nodeId: 'b', prereqId: 'a' }]);

  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);
});

test('duplicate edges are rejected before saving', () => {
  const edge = { nodeId: 'b', prereqId: 'a' };
  const result = validateGraph([node('a'), node('b')], [edge, edge]);

  assert.equal(result.isValid, false);
  assert.equal(result.errors[0]!.type, 'duplicate_edge');
});

test('disconnected course components are rejected', () => {
  const result = validateGraph(
    [node('a'), node('b'), node('c')],
    [{ nodeId: 'b', prereqId: 'a' }],
  );

  assert.equal(result.isValid, false);
  assert.equal(result.errors[0]!.type, 'disconnected_graph');
  assert.deepEqual(result.errors[0]!.nodeIds, ['c']);
});

test('connectivity reports the small orphan even when it is listed first', () => {
  const result = validateGraph(
    [node('orphan'), node('a'), node('b')],
    [{ nodeId: 'b', prereqId: 'a' }],
  );

  assert.deepEqual(result.errors[0]!.nodeIds, ['orphan']);
});

test('the author-facing cycle report does not depend on node order either', () => {
  const prereqs = [
    { nodeId: 'a', prereqId: 'b' },
    { nodeId: 'b', prereqId: 'a' },
    { nodeId: 'n', prereqId: 'c' },
    { nodeId: 'c', prereqId: 'a' },
  ];
  const idsFor = (order: string[]) =>
    validateGraph(order.map(node), prereqs)
      .errors.find((e) => e.type === 'cycle_detected')!.nodeIds.slice().sort();

  assert.deepEqual(idsFor(['a', 'b', 'n', 'c']), ['a', 'b', 'c', 'n']);
  assert.deepEqual(idsFor(['a', 'b', 'n', 'c']), idsFor(['a', 'b', 'c', 'n']));
});
