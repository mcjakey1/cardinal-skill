import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ChartState } from './chartDraft.ts';
import type { ChartChangeSet } from './chartDiff.ts';
import { hasDestructiveChanges, summariseImpact, type ImpactRow } from './chartImpact.ts';
import type { SkillNode } from './types.ts';

function node(id: string, title: string): SkillNode {
  return {
    id, courseId: 'c', trackId: null, title, description: '',
    kind: 'topic', xpReward: 50, x: 0, y: 0, sortOrder: 0,
  };
}

const LIVE: ChartState = {
  nodes: [node('a', 'Describing data'), node('b', 'Midterm'), node('c', 'Final')],
  prereqs: [{ nodeId: 'b', prereqId: 'a' }, { nodeId: 'c', prereqId: 'b' }],
  missions: [],
};

const EMPTY: ChartChangeSet = {
  insertNodes: [], updateNodes: [], archiveNodes: [], restoreNodes: [],
  deletePrereqs: [], insertPrereqs: [], upsertMissions: [], deleteMissions: [],
};

test('a publish with no archives is not destructive', () => {
  assert.equal(hasDestructiveChanges({ ...EMPTY, updateNodes: [node('a', 'Renamed')] }), false);
  assert.equal(hasDestructiveChanges({ ...EMPTY, archiveNodes: ['b'] }), true);
  assert.equal(hasDestructiveChanges({ ...EMPTY, deleteMissions: ['m1'] }), true);
});

test('a node nobody has cleared reports zero impact, not a missing row', () => {
  const rows: ImpactRow[] = [
    { nodeId: 'b', studentsCompleted: 0, missionsHidden: 0, missionCompletions: 0, helpDescendants: 0 },
  ];
  const [impact] = summariseImpact({ ...EMPTY, archiveNodes: ['b'] }, LIVE, rows);

  assert.equal(impact?.studentsCompleted, 0);
  assert.equal(impact?.title, 'Midterm', 'the readout names the node, never its uuid');
});

test('archiving a node counts the edges it leaves dangling on both sides', () => {
  const rows: ImpactRow[] = [
    { nodeId: 'b', studentsCompleted: 7, missionsHidden: 3, missionCompletions: 12, helpDescendants: 2 },
  ];
  const [impact] = summariseImpact({ ...EMPTY, archiveNodes: ['b'] }, LIVE, rows);

  assert.equal(impact?.danglingEdges, 2, 'b requires a, and c requires b');
  assert.equal(impact?.studentsCompleted, 7);
  assert.equal(impact?.helpDescendants, 2);
});

test('a node with no impact row at all reads as zero rather than throwing', () => {
  const [impact] = summariseImpact({ ...EMPTY, archiveNodes: ['b'] }, LIVE, []);

  assert.equal(impact?.studentsCompleted, 0);
  assert.equal(impact?.missionsHidden, 0);
});
