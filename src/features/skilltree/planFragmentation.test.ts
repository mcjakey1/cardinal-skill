import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planFragmentation } from './missions.ts';

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

test('a node with no missions keeps the node-level split', () => {
  const plan = planFragmentation(100, [], 2);

  assert.equal(plan.missionRewards, null, 'there are no missions to re-price');
  assert.equal(plan.parentReward + sum(plan.stepRewards), 100);
});

test('a node made of missions re-prices the missions, not the node column', () => {
  // The student's XP comes from completed missions, so leaving these at their
  // old value while the steps take a share is how help would mint XP.
  const plan = planFragmentation(100, [50, 30, 20], 2);

  assert.notEqual(plan.missionRewards, null);
  assert.equal(sum(plan.missionRewards!) + sum(plan.stepRewards), 100);
});

test('the node column stays equal to what its missions are worth', () => {
  // `xp_reward` is a cache of the mission sum. If the two disagree the chart and
  // the record report different totals for the same node.
  const plan = planFragmentation(100, [50, 30, 20], 2);

  assert.equal(plan.parentReward, sum(plan.missionRewards!));
});

test('the mission sum is trusted over a stale node column', () => {
  // The column can lag: a mission added or re-priced without touching the node.
  // The missions are the source of truth, so conservation is measured against
  // them.
  const plan = planFragmentation(999, [50, 30, 20], 2);

  assert.equal(sum(plan.missionRewards!) + sum(plan.stepRewards), 100);
});

test('no steps means nothing moves', () => {
  const plan = planFragmentation(100, [50, 50], 0);

  assert.deepEqual(plan.stepRewards, []);
  assert.equal(sum(plan.missionRewards!), 100);
});

test('conservation holds on totals that do not divide evenly', () => {
  for (const [total, steps] of [
    [7, 3],
    [13, 2],
    [101, 4],
    [1, 5],
  ] as const) {
    const plan = planFragmentation(total, [total], steps);
    assert.equal(
      sum(plan.missionRewards!) + sum(plan.stepRewards),
      total,
      `${total} across ${steps} steps`,
    );
  }
});

test('a node worth nothing does not produce negative rewards', () => {
  const plan = planFragmentation(0, [], 3);

  assert.equal(plan.parentReward, 0);
  assert.deepEqual(plan.stepRewards, [0, 0, 0]);
});
