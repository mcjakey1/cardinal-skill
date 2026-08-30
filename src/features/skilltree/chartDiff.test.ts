import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ChartState } from './chartDraft.ts';
import { countChanges, diffCharts, isEmptyChangeSet } from './chartDiff.ts';
import type { Mission, SkillNode } from './types.ts';

function node(id: string, extra: Partial<SkillNode> = {}): SkillNode {
  return {
    id, courseId: 'c', trackId: null, title: id, description: '',
    kind: 'topic', xpReward: 50, x: 0, y: 0, sortOrder: 0, ...extra,
  };
}

function mission(id: string, skillId: string, extra: Partial<Mission> = {}): Mission {
  return { id, skillId, title: id, description: '', kind: 'topic', xpReward: 10, ...extra };
}

const LIVE: ChartState = {
  nodes: [node('a'), node('b')],
  prereqs: [{ nodeId: 'b', prereqId: 'a' }],
  missions: [mission('m1', 'a')],
};

test('an untouched draft produces no writes at all', () => {
  const set = diffCharts(LIVE, LIVE);

  assert.equal(isEmptyChangeSet(set), true);
  assert.equal(countChanges(set), 0);
});

test('a node present only in the draft is an insert, not an update', () => {
  const set = diffCharts(LIVE, { ...LIVE, nodes: [...LIVE.nodes, node('c')] });

  assert.deepEqual(set.insertNodes.map((n) => n.id), ['c']);
  assert.deepEqual(set.updateNodes, []);
});

test('a changed field is an update and an unchanged node is left alone', () => {
  const set = diffCharts(LIVE, { ...LIVE, nodes: [node('a', { title: 'Renamed' }), node('b')] });

  assert.deepEqual(set.updateNodes.map((n) => n.id), ['a']);
});

test('archiving is reported as an id, never as a node removal', () => {
  const set = diffCharts(LIVE, { ...LIVE, nodes: [node('a'), node('b', { archived: true })] });

  assert.deepEqual(set.archiveNodes, ['b']);
  assert.deepEqual(set.updateNodes, [], 'the archive flag alone is not a field update');
});

test('a node dropped from the draft entirely is ignored, because publish never deletes', () => {
  const set = diffCharts(LIVE, { ...LIVE, nodes: [node('a')] });

  assert.equal(isEmptyChangeSet(set), true, 'a missing node is not a delete instruction');
});

test('a re-pointed edge is one delete and one insert', () => {
  const set = diffCharts(LIVE, { ...LIVE, prereqs: [{ nodeId: 'a', prereqId: 'b' }] });

  assert.deepEqual(set.deletePrereqs, [{ nodeId: 'b', prereqId: 'a' }]);
  assert.deepEqual(set.insertPrereqs, [{ nodeId: 'a', prereqId: 'b' }]);
});

test('a mission gone from the draft is a delete, and a re-priced one is an upsert', () => {
  const set = diffCharts(LIVE, { ...LIVE, missions: [mission('m1', 'a', { xpReward: 25 }), mission('m2', 'b')] });

  assert.deepEqual(set.upsertMissions.map((m) => m.id), ['m1', 'm2']);
  assert.deepEqual(set.deleteMissions, []);

  const removed = diffCharts(LIVE, { ...LIVE, missions: [] });
  assert.deepEqual(removed.deleteMissions, ['m1']);
});
