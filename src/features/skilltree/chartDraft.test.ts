import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aliveSubgraph, applyOp, canRedo, emptyDraft, redo, undo, type ChartState } from './chartDraft.ts';
import type { SkillNode } from './types.ts';

function node(id: string, extra: Partial<SkillNode> = {}): SkillNode {
  return {
    id, courseId: 'c', trackId: null, title: id, description: '',
    kind: 'topic', xpReward: 50, x: 0, y: 0, sortOrder: 0, ...extra,
  };
}

const STATE: ChartState = {
  nodes: [node('a'), node('b')],
  prereqs: [{ nodeId: 'b', prereqId: 'a' }],
  missions: [],
};

test('an applied op followed by undo returns the working copy it started from', () => {
  const start = emptyDraft(STATE);
  const edited = applyOp(start, {
    t: 'field', nodeId: 'a', before: { title: 'a' }, after: { title: 'Renamed' },
  });

  assert.equal(edited.working.nodes.find((n) => n.id === 'a')?.title, 'Renamed');
  assert.deepEqual(undo(edited).working, start.working);
});

test('redo is cleared by a new op, not kept alongside it', () => {
  const start = emptyDraft(STATE);
  const once = applyOp(start, { t: 'move', nodeId: 'a', before: { x: 0, y: 0 }, after: { x: 10, y: 5 } });
  const back = undo(once);

  assert.equal(canRedo(back), true, 'undo leaves something to redo');

  const diverged = applyOp(back, { t: 'move', nodeId: 'b', before: { x: 0, y: 0 }, after: { x: 3, y: 3 } });

  assert.equal(canRedo(diverged), false, 'a new branch drops the old redo tail');
  assert.equal(diverged.working.nodes.find((n) => n.id === 'a')?.x, 0, 'the undone move stays undone');
});

test('archiving a node keeps it in the working copy, flagged, not removed', () => {
  const edited = applyOp(emptyDraft(STATE), { t: 'archive', nodeId: 'b' });

  assert.equal(edited.working.nodes.length, 2, 'archive is a flag, never a removal');
  assert.equal(edited.working.nodes.find((n) => n.id === 'b')?.archived, true);
});

test('an unlink removes only the named edge', () => {
  const edited = applyOp(emptyDraft(STATE), { t: 'unlink', nodeId: 'b', prereqId: 'a' });

  assert.deepEqual(edited.working.prereqs, []);
  assert.deepEqual(undo(edited).working.prereqs, [{ nodeId: 'b', prereqId: 'a' }]);
});

test('redo after undo replays the same op', () => {
  const once = applyOp(emptyDraft(STATE), { t: 'archive', nodeId: 'a' });

  assert.equal(redo(undo(once)).working.nodes.find((n) => n.id === 'a')?.archived, true);
});

test('a retired node takes its edges out of the chart with it, not just itself', () => {
  const tree = {
    nodes: [node('a'), node('b'), node('c', { archived: true })],
    prereqs: [
      { nodeId: 'b', prereqId: 'a' },
      { nodeId: 'c', prereqId: 'a' },
      { nodeId: 'b', prereqId: 'c' },
    ],
  };

  const alive = aliveSubgraph(tree);

  assert.deepEqual(alive.nodes.map((n) => n.id), ['a', 'b']);
  assert.deepEqual(
    alive.prereqs,
    [{ nodeId: 'b', prereqId: 'a' }],
    'an edge is dropped whichever end of it retired',
  );
});
