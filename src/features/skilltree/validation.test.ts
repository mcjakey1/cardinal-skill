import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateGraph } from './validation.ts';
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
