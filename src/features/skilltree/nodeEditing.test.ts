import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  XP_MAX,
  linkRefusal,
  mintId,
  missionsEqual,
  nodeEditForm,
  nodeEditProblems,
  nodeEditResult,
} from './nodeEditing.ts';
import type { Mission, SkillNode } from './types.ts';

function node(id: string, extra: Partial<SkillNode> = {}): SkillNode {
  return {
    id, courseId: 'c', trackId: null, title: id, description: '',
    kind: 'topic', xpReward: 50, x: 0, y: 0, sortOrder: 0, ...extra,
  };
}

function mission(id: string, xpReward: number, skillId = 'a'): Mission {
  return { id, skillId, title: id, description: '', kind: 'topic', xpReward, estimatedMinutes: 30 };
}

test('the form opens on the name a reader is already seeing', () => {
  const form = nodeEditForm(node('a', { title: 'Describing data', questTitle: 'The First Count' }), []);
  assert.equal(form.title, 'The First Count');
  assert.equal(form.universal, false);
});

test('a node with missions takes its xp from the sum of their rewards', () => {
  const target = node('a');
  const form = nodeEditForm(target, [mission('m1', 30), mission('m2', 45)]);
  form.xp = '999';
  assert.equal(nodeEditResult(form, target).xpReward, 75);
});

test('a node with no missions keeps the typed xp, clamped', () => {
  const target = node('a');
  const form = nodeEditForm(target, []);
  form.xp = '99999';
  assert.equal(nodeEditResult(form, target).xpReward, XP_MAX);
});

test('a name equal to the syllabus title is agreement, not an override', () => {
  const target = node('a', { title: 'Describing data' });
  const form = nodeEditForm(target, []);
  form.title = '  Describing data  ';
  assert.equal(nodeEditResult(form, target).titleOverride, null);
});

test('a name typed over the syllabus title is stored as an override', () => {
  const target = node('a', { title: 'Describing data' });
  const form = nodeEditForm(target, []);
  form.title = 'Summary statistics';
  assert.equal(nodeEditResult(form, target).titleOverride, 'Summary statistics');
});

test('an empty name and an out-of-range xp both block the save', () => {
  const target = node('a');
  const form = nodeEditForm(target, []);
  form.title = '   ';
  form.xp = '0';
  const problems = nodeEditProblems(form);
  assert.equal(problems.title, 'A node needs a name.');
  assert.match(problems.xp ?? '', /between 1 and 2000/);
});

test('xp is not checked while missions own it', () => {
  const target = node('a');
  const form = nodeEditForm(target, [mission('m1', 30)]);
  form.xp = 'not a number';
  assert.equal(nodeEditProblems(form).xp, undefined);
});

test('a node cannot require itself', () => {
  assert.equal(linkRefusal([node('a')], [], 'a', 'a'), 'A node cannot require itself.');
});

test('a link that closes a loop is refused by name', () => {
  const nodes = [node('a'), node('b')];
  const refusal = linkRefusal(nodes, [{ nodeId: 'b', prereqId: 'a' }], 'b', 'a');
  assert.match(refusal ?? '', /loop/);
});

test('a link to a node that is not on the chart is refused', () => {
  assert.notEqual(linkRefusal([node('a')], [], 'a', 'ghost'), null);
});

test('a valid link is allowed', () => {
  assert.equal(linkRefusal([node('a'), node('b')], [], 'a', 'b'), null);
});

test('missions compare by content, not identity', () => {
  assert.ok(missionsEqual([mission('m1', 30)], [mission('m1', 30)]));
  assert.ok(!missionsEqual([mission('m1', 30)], [mission('m1', 31)]));
  assert.ok(!missionsEqual([mission('m1', 30)], []));
});

test('minted ids are v4-shaped and do not repeat', () => {
  const ids = new Set(Array.from({ length: 50 }, mintId));
  assert.equal(ids.size, 50);
  for (const id of ids) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test('the first link on a fresh chart is allowed even though the chart is not yet connected', () => {
  const nodes = [node('a'), node('b'), node('c'), node('d')];
  assert.equal(linkRefusal(nodes, [], 'a', 'b'), null);
});

test('a link that neither fixes nor breaks anything is allowed on a chart that is already invalid', () => {
  const nodes = [node('a'), node('b'), node('c'), node('d')];
  const prereqs = [{ nodeId: 'b', prereqId: 'a' }, { nodeId: 'c', prereqId: 'b' }];
  // d stays orphaned either way; a -> c is a shortcut that changes nothing else.
  assert.equal(linkRefusal(nodes, prereqs, 'a', 'c'), null);
});

test('a loop is still refused on a chart that already has other problems', () => {
  const nodes = [node('a'), node('b'), node('c'), node('d')];
  // c and d are already orphaned; b -> a still has to be refused as a loop.
  const refusal = linkRefusal(nodes, [{ nodeId: 'b', prereqId: 'a' }], 'b', 'a');
  assert.match(refusal ?? '', /loop/);
});
