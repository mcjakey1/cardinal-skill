import assert from 'node:assert/strict';
import { test } from 'node:test';

import { autoLayout } from './autoLayout.ts';
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

test('a node is never placed left of one of its prerequisites', () => {
  // b requires a; c requires b. Positions are assigned, not read from input.
  const nodes = [node('c'), node('a'), node('b')];
  const prereqs: Prereq[] = [
    { nodeId: 'b', prereqId: 'a' },
    { nodeId: 'c', prereqId: 'b' },
  ];

  const placed = autoLayout(nodes, prereqs);
  const at = (id: string) => placed.nodes.find((n) => n.id === id)!;

  assert.ok(at('b').x > at('a').x, 'b should sit right of its prerequisite a');
  assert.ok(at('c').x > at('b').x, 'c should sit right of its prerequisite b');
});

test('siblings at the same depth do not land on top of each other', () => {
  // b and c both depend only on a, so both sit one rank in.
  const nodes = [node('a'), node('b'), node('c')];
  const prereqs: Prereq[] = [
    { nodeId: 'b', prereqId: 'a' },
    { nodeId: 'c', prereqId: 'a' },
  ];

  const placed = autoLayout(nodes, prereqs);
  const at = (id: string) => placed.nodes.find((n) => n.id === id)!;

  assert.equal(at('b').x, at('c').x, 'same depth means same column');
  assert.notEqual(at('b').y, at('c').y, 'same column means they must differ vertically');
});

test('a cycle still places every node instead of hanging', () => {
  // The parser is untrusted input: a -> b -> c -> a is a graph it can emit.
  const nodes = [node('a'), node('b'), node('c')];
  const prereqs: Prereq[] = [
    { nodeId: 'b', prereqId: 'a' },
    { nodeId: 'c', prereqId: 'b' },
    { nodeId: 'a', prereqId: 'c' },
  ];

  const placed = autoLayout(nodes, prereqs);

  assert.equal(placed.nodes.length, 3);
  for (const n of placed.nodes) {
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), `${n.id} has a real position`);
  }
});

test('a prerequisite pointing at a node that does not exist is ignored', () => {
  const nodes = [node('a'), node('b')];
  const prereqs: Prereq[] = [
    { nodeId: 'b', prereqId: 'a' },
    { nodeId: 'b', prereqId: 'ghost' },
  ];

  const placed = autoLayout(nodes, prereqs);
  const at = (id: string) => placed.nodes.find((n) => n.id === id)!;

  assert.equal(at('a').x, 0);
  assert.equal(at('b').x, 150, 'b ranks off its one real prerequisite, not the missing one');
});

test('an empty chart lays out to an empty chart', () => {
  assert.deepEqual(autoLayout([], []).nodes, []);
});
