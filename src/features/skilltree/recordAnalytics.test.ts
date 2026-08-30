import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activityPunchCard,
  completionEstimateDays,
  nodesPerWeek,
  playerTitle,
} from './recordAnalytics.ts';

const TODAY = new Date('2026-08-27T12:00:00');

test('activity punch card marks real local calendar days in order', () => {
  const cells = activityPunchCard([
    '2026-08-26T09:00:00',
    'not-a-date',
  ], TODAY, 3);
  assert.deepEqual(cells.map((cell) => cell.active), [false, true, false]);
});

test('velocity and completion estimates stay finite and actionable', () => {
  assert.equal(nodesPerWeek([
    '2026-08-27T09:00:00',
    '2026-08-20T09:00:00',
    '2026-07-01T09:00:00',
  ], TODAY), 0.5);
  assert.equal(completionEstimateDays(6, 3), 14);
  assert.equal(completionEstimateDays(6, 0), null);
  assert.equal(completionEstimateDays(0, 0), 0);
});

test('the velocity window includes the entire first calendar day', () => {
  assert.equal(nodesPerWeek(
    ['2026-08-01T00:01:00'],
    new Date('2026-08-28T18:00:00'),
    28,
  ), 0.3);
});

test('player titles rise at stable level boundaries', () => {
  assert.equal(playerTitle(1), 'Initiate');
  assert.equal(playerTitle(4), 'Apprentice');
  assert.equal(playerTitle(7), 'Specialist');
  assert.equal(playerTitle(10), 'Grandmaster');
});
