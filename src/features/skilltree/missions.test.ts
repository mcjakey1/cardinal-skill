import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  fragmentMissionXp,
  effectiveMissionCompletionIds,
  isNodeMastered,
  missionStates,
  missionsForNode,
  nextMission,
  nodeXpEarned,
  nodeXpFromMissions,
  type MissionLike,
} from './missions.ts';
import { HELP_SHARE } from './subtree.ts';

const m = (id: string, skillId: string, xpReward: number): MissionLike => ({ id, skillId, xpReward });

const FIXTURE: MissionLike[] = [
  m('m1', 'hashing', 100),
  m('m2', 'hashing', 90),
  m('m3', 'hashing', 60),
  m('m4', 'trees', 250),
];

test('a locked node locks the work still to do, but not the work already done', () => {
  // A node can become locked after the fact — an instructor adds a prerequisite
  // to a node whose missions someone has already finished. The lock stops new
  // work; it does not un-do finished work.
  const states = missionStates(FIXTURE, 'hashing', ['m1'], false);

  assert.deepEqual(
    states.map((s) => s.state),
    ['done', 'locked', 'locked'],
  );
});

test('a locked node with nothing done offers nothing', () => {
  const states = missionStates(FIXTURE, 'hashing', [], false);

  assert.deepEqual(
    states.map((s) => s.state),
    ['locked', 'locked', 'locked'],
    'missions are not a way around a prerequisite you have not met',
  );
});

test('an unlocked node offers its unfinished missions and marks the rest done', () => {
  const states = missionStates(FIXTURE, 'hashing', ['m2'], true);

  assert.deepEqual(
    states.map((s) => s.state),
    ['open', 'done', 'open'],
  );
});

test('the next mission is the first unfinished one, and nothing once they are all done', () => {
  assert.equal(nextMission(FIXTURE, 'hashing', ['m1'], true)?.id, 'm2');
  assert.equal(nextMission(FIXTURE, 'hashing', ['m1', 'm2'], true)?.id, 'm3');
  assert.equal(nextMission(FIXTURE, 'hashing', ['m1', 'm2', 'm3'], true), undefined);
});

test('a locked node recommends no mission at all', () => {
  assert.equal(nextMission(FIXTURE, 'hashing', [], false), undefined);
});

test('a node is worth the sum of its missions', () => {
  assert.equal(nodeXpFromMissions(FIXTURE, 'hashing'), 250);
  assert.equal(nodeXpFromMissions(FIXTURE, 'trees'), 250);
  assert.equal(nodeXpFromMissions(FIXTURE, 'nonexistent'), 0, 'a node with no missions holds no work');
  assert.equal(missionsForNode(FIXTURE, 'hashing').length, 3);
});

test('local unmarks override stale server completion while new local work joins it', () => {
  assert.deepEqual(
    effectiveMissionCompletionIds(['server-done', 'undo-me'], ['local-done'], ['undo-me']),
    ['server-done', 'local-done'],
  );
});

test('earned XP counts only completed missions, and mastery means all of them', () => {
  assert.equal(nodeXpEarned(FIXTURE, 'hashing', []), 0);
  assert.equal(nodeXpEarned(FIXTURE, 'hashing', ['m1']), 100);
  assert.equal(nodeXpEarned(FIXTURE, 'hashing', ['m1', 'm3']), 160);
  assert.equal(nodeXpEarned(FIXTURE, 'hashing', ['m4']), 0, "another node's mission must not count");

  assert.equal(isNodeMastered(FIXTURE, 'hashing', ['m1', 'm2']), false);
  assert.equal(isNodeMastered(FIXTURE, 'hashing', ['m1', 'm2', 'm3']), true);
  assert.equal(isNodeMastered(FIXTURE, 'empty', ['m1']), false, 'a node with no missions is not mastered');
});

test('asking for help re-slices the node total and never changes it', () => {
  // The invariant, across a wide grid including the degenerate cases.
  const missionSets = [
    [100, 90, 60],
    [250],
    [1, 1, 1],
    [7],
    [0, 0],
    [333, 333, 334],
    [1000, 1, 1, 1, 1],
    [],
    [5, 0, 5],
  ];

  for (const set of missionSets) {
    const total = set.reduce((a, b) => a + b, 0);
    for (let steps = 0; steps <= 6; steps += 1) {
      const { missionRewards, stepRewards } = fragmentMissionXp(set, steps);
      const after = missionRewards.reduce((a, b) => a + b, 0) + stepRewards.reduce((a, b) => a + b, 0);

      assert.equal(after, total, `XP changed for ${JSON.stringify(set)} split ${steps} ways`);
      assert.equal(missionRewards.length, set.length, 'a mission must not vanish');
      assert.ok(
        missionRewards.every((x) => Number.isInteger(x) && x >= 0),
        'mission XP stays a non-negative integer',
      );
      assert.ok(
        stepRewards.every((x) => Number.isInteger(x) && x >= 0),
        'step XP stays a non-negative integer',
      );
    }
  }
});

test('help steps take roughly HELP_SHARE, and the missions keep their relative worth', () => {
  const { missionRewards, stepRewards } = fragmentMissionXp([100, 90, 60], 3);

  const stepTotal = stepRewards.reduce((a, b) => a + b, 0);
  assert.equal(stepTotal, 99, '40% of 250, floored per step');
  assert.equal(
    missionRewards.reduce((a, b) => a + b, 0),
    151,
    'the missions keep the remainder',
  );
  assert.ok(stepTotal / 250 <= HELP_SHARE, 'flooring must never hand the steps more than the share');

  // Order preserved and proportions roughly intact: the 100 mission still
  // outranks the 90, which still outranks the 60.
  assert.ok(missionRewards[0]! > missionRewards[1]!);
  assert.ok(missionRewards[1]! > missionRewards[2]!);
});

test('garbage mission XP is normalised rather than propagated', () => {
  const junk = [Number.NaN, -50, Infinity, 30] as number[];
  const { missionRewards, stepRewards } = fragmentMissionXp(junk, 2);
  const total = missionRewards.reduce((a, b) => a + b, 0) + stepRewards.reduce((a, b) => a + b, 0);

  assert.equal(total, 30, 'only the one real value survives, and it is conserved');
  assert.ok(missionRewards.every((x) => Number.isInteger(x) && x >= 0));

  assert.equal(nodeXpFromMissions([m('bad', 'n', Number.NaN), m('ok', 'n', 40)], 'n'), 40);
});

test('fragmenting twice in a row still conserves the original total', () => {
  const first = fragmentMissionXp([100, 90, 60], 3);
  const second = fragmentMissionXp(first.missionRewards, 2);

  const stillThere =
    second.missionRewards.reduce((a, b) => a + b, 0) +
    second.stepRewards.reduce((a, b) => a + b, 0) +
    first.stepRewards.reduce((a, b) => a + b, 0);

  assert.equal(stillThere, 250, 'a student who asks for help twice has not lost or gained XP');
});
