import assert from 'node:assert/strict';
import { test } from 'node:test';

// Explicit .ts extension: `node --test` strips types but does not resolve
// extensionless specifiers the way Metro does.
import {
  findPeople,
  mergeRoster,
  rosterFlag,
  sortRoster,
  type RosterContact,
  type RosterEntry,
  type RosterProgress,
} from './roster.ts';
import { STALE_DAYS } from './cohort.ts';

function contact(userId: string, over: Partial<RosterContact> = {}): RosterContact {
  return {
    userId,
    displayName: userId.toUpperCase(),
    email: `${userId}@example.edu`,
    enrolled: true,
    ...over,
  };
}

function figures(userId: string, over: Partial<RosterProgress> = {}): RosterProgress {
  return {
    userId,
    displayName: userId.toUpperCase(),
    mastered: 2,
    gradedNodes: 8,
    progress: 25,
    xp: 100,
    lastActive: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function entry(over: Partial<RosterEntry> = {}): RosterEntry {
  return {
    userId: 'u',
    displayName: 'U',
    email: 'u@example.edu',
    enrolled: true,
    mastered: 1,
    gradedNodes: 8,
    progress: 13,
    xp: 50,
    lastActive: null,
    ...over,
  };
}

test('an enrolled roster carries both the address and the figures', () => {
  const view = mergeRoster([contact('a'), contact('b')], [figures('a'), figures('b', { xp: 40 })]);

  assert.equal(view.mode, 'enrolled');
  assert.deepEqual(
    view.rows.map((r) => [r.email, r.xp, r.enrolled]),
    [
      ['a@example.edu', 100, true],
      ['b@example.edu', 40, true],
    ],
  );
});

test('the registered fallback is reported as itself, never as enrolment', () => {
  // What 0029 returns when nothing is enrolled: real accounts, enrolled false,
  // and no progress read to join against.
  const view = mergeRoster([contact('a', { enrolled: false }), contact('b', { enrolled: false })], []);

  assert.equal(view.mode, 'registered');
  assert.ok(view.rows.every((r) => r.enrolled === false));
  assert.deepEqual(
    view.rows.map((r) => [r.progress, r.mastered, r.xp, r.lastActive]),
    [
      [0, 0, 0, null],
      [0, 0, 0, null],
    ],
  );
});

test('a contact with no progress row is kept, not dropped', () => {
  // The empty panel this whole change exists to fix: losing the person because
  // one of the two reads had nothing to say about them.
  const view = mergeRoster([contact('a'), contact('b')], [figures('a')]);

  assert.equal(view.rows.length, 2);
  assert.equal(view.rows[1]!.userId, 'b');
  // gradedNodes describes the course, so the row without figures borrows it.
  assert.equal(view.rows[1]!.gradedNodes, 8);
  assert.equal(view.rows[1]!.progress, 0);
});

test('a database without 0030 degrades to the old roster instead of failing', () => {
  const view = mergeRoster(null, [figures('a')]);

  assert.equal(view.mode, 'no-contacts');
  assert.equal(view.rows[0]!.email, null);
  assert.equal(view.rows[0]!.enrolled, true);
  assert.equal(view.rows[0]!.xp, 100);
});

test('an empty course reads as enrolled-and-empty, not as a fallback', () => {
  assert.equal(mergeRoster([], []).mode, 'enrolled');
  assert.deepEqual(mergeRoster([], []).rows, []);
});

test('least progress first, then name', () => {
  const rows = sortRoster([
    entry({ userId: 'c', displayName: 'C', progress: 60 }),
    entry({ userId: 'b', displayName: 'B', progress: 0 }),
    entry({ userId: 'a', displayName: 'A', progress: 0 }),
  ]);

  assert.deepEqual(
    rows.map((r) => r.userId),
    ['a', 'b', 'c'],
  );
});

test('a registered account is never flagged for work it was never set', () => {
  const now = new Date('2026-08-28T00:00:00.000Z');
  const stale = new Date(now.getTime() - (STALE_DAYS + 1) * 86_400_000).toISOString();

  assert.equal(rosterFlag(entry({ enrolled: false, mastered: 0 }), now), null);
  assert.equal(rosterFlag(entry({ enrolled: false, mastered: 3, lastActive: stale }), now), null);

  // The same rows, once they are actually on the course, still flag.
  assert.equal(rosterFlag(entry({ enrolled: true, mastered: 0 }), now), 'not-started');
  assert.equal(rosterFlag(entry({ enrolled: true, mastered: 3, lastActive: stale }), now), 'stale');
});

// ------------------------------------------------------- finding one student

const CLASS: RosterEntry[] = [
  entry({ userId: 'a', displayName: 'A. Reyes', email: 'a.reyes@example.edu' }),
  entry({ userId: 'b', displayName: 'Bea Okafor', email: 'b.okafor@example.edu' }),
  entry({ userId: 'c', displayName: 'C. Lindqvist', email: null }),
];

const found = (query: string) => findPeople(query, CLASS).map((r) => r.userId);

test('an empty search is not a filter — it is everyone', () => {
  assert.deepEqual(found(''), ['a', 'b', 'c']);
  assert.deepEqual(found('   '), ['a', 'b', 'c']);
});

test('a name is matched however it was typed', () => {
  assert.deepEqual(found('okafor'), ['b']);
  assert.deepEqual(found('OKAFOR'), ['b']);
  assert.deepEqual(found('  Bea  '), ['b']);
});

test('an address finds the person it belongs to', () => {
  assert.deepEqual(found('a.reyes@example.edu'), ['a']);
  assert.deepEqual(found('@example.edu'), ['a', 'b']);
});

test('a student with no address on file is still findable by name', () => {
  assert.deepEqual(found('lindqvist'), ['c']);
});

test('a name nobody has finds nobody, rather than everybody', () => {
  assert.deepEqual(found('zzz'), []);
});

test('the roster order survives the search', () => {
  assert.deepEqual(found('.'), ['a', 'b', 'c']);
});
