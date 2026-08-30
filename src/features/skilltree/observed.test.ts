import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NO_VISIT, daysActive, learnerSignals, nodeSignal } from './observed.ts';

test('a node nobody has opened reads as a zero signal, not as missing', () => {
  // `struggleScore` divides by the node's estimate, so an undefined signal
  // reaching it is where the NaN would come from.
  const signal = nodeSignal('n1', undefined);

  assert.deepEqual(signal, {
    nodeId: 'n1',
    attempts: 0,
    msSpent: 0,
    hintsUsed: 0,
    helpRequested: false,
    masteredAt: null,
  });
});

test('hints are always zero, because there is no hint feature to count', () => {
  const signal = nodeSignal('n1', { attempts: 9, msSpent: 1000, helpRequested: true });

  assert.equal(signal.hintsUsed, 0);
});

test('mastery is carried through, so help is not offered on finished work', () => {
  const signal = nodeSignal('n1', NO_VISIT, '2026-08-01T10:00:00.000Z');

  assert.equal(signal.masteredAt, '2026-08-01T10:00:00.000Z');
});

test('a learner with no history has been active one day, never zero', () => {
  // paceTarget divides by daysActive/7. Zero here is a division by zero.
  assert.equal(daysActive([], new Date('2026-08-05T12:00:00.000Z')), 1);
});

test('days active counts from the first thing they ever did, inclusive', () => {
  const days = daysActive(
    ['2026-08-01T23:00:00.000Z', '2026-08-03T01:00:00.000Z'],
    new Date('2026-08-05T00:30:00.000Z'),
  );

  // 1st, 2nd, 3rd, 4th, 5th.
  assert.equal(days, 5);
});

test('an unparseable timestamp does not poison the count', () => {
  const days = daysActive(
    ['not a date', '2026-08-04T09:00:00.000Z'],
    new Date('2026-08-05T09:00:00.000Z'),
  );

  assert.equal(days, 2);
});

test('learner signals carry one entry per visited node', () => {
  const signals = learnerSignals(
    { n1: { attempts: 2, msSpent: 60_000, helpRequested: false } },
    { n2: '2026-08-04T09:00:00.000Z' },
    3,
    new Date('2026-08-05T09:00:00.000Z'),
  );

  assert.equal(signals.streakDays, 3);
  assert.equal(signals.daysActive, 2);
  assert.deepEqual(
    signals.nodeSignals.map((s) => s.nodeId).sort(),
    ['n1', 'n2'],
    'a node that was mastered without ever being opened still counts',
  );
});
