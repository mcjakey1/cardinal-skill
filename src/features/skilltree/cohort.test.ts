/**
 * The suppression rule is the only thing standing between a filtered roster and
 * a re-identified student, so it gets a check.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MIN_COHORT,
  STALE_DAYS,
  activityFlag,
  skillFriction,
  summariseCohort,
  type AnalyticsStudent,
} from './cohort.ts';

const student = (i: number, status: AnalyticsStudent['status'] = 'on-track'): AnalyticsStudent => ({
  id: `st${i}`,
  name: `Student ${i}`,
  mastered: i,
  progress: i * 10,
  streak: i,
  status,
});

const cohort = (n: number, status?: AnalyticsStudent['status']) =>
  Array.from({ length: n }, (_, i) => student(i + 1, status));

test('a group at the threshold reports figures', () => {
  const result = summariseCohort(cohort(MIN_COHORT));
  assert.equal(result.suppressed, false);
  assert.equal(result.suppressed === false && result.summary.size, MIN_COHORT);
});

test('a group one below the threshold is suppressed', () => {
  const result = summariseCohort(cohort(MIN_COHORT - 1));
  assert.equal(result.suppressed, true);
  assert.equal(result.suppressed === true && result.size, MIN_COHORT - 1);
});

test('an empty group is suppressed rather than reported as zero', () => {
  const result = summariseCohort([]);
  assert.equal(result.suppressed, true);
});

test('averages are computed over the group, not the class it came from', () => {
  const result = summariseCohort(cohort(5));
  assert.equal(result.suppressed, false);
  // progress runs 10,20,30,40,50 — mean 30.
  assert.equal(result.suppressed === false && result.summary.averageProgress, 30);
});

test('needs-support is counted, not inferred', () => {
  const mixed = [...cohort(3), ...cohort(2, 'needs-support')];
  const result = summariseCohort(mixed);
  assert.equal(result.suppressed === false && result.summary.needsSupport, 2);
});

test('a filtered subgroup below the threshold suppresses even when the class is large', () => {
  const klass = [...cohort(30), ...cohort(2, 'needs-support')];
  const struggling = klass.filter((s) => s.status === 'needs-support');
  assert.equal(klass.length >= MIN_COHORT, true);
  assert.equal(summariseCohort(struggling).suppressed, true);
});

test('per-skill friction obeys the same threshold', () => {
  const skills = [{ id: 'skill_1', title: 'One' }];
  const reached = () => true;
  assert.equal(skillFriction(cohort(4), skills, reached).suppressed, true);
  assert.equal(skillFriction(cohort(5), skills, reached).suppressed, false);
});

test('friction percentages are relative to the group size', () => {
  const skills = [{ id: 'skill_1', title: 'One' }];
  // Only students with an even index "reached" it: 2 of 5 -> 40%.
  const result = skillFriction(cohort(5), skills, (s) => Number(s.id.slice(2)) % 2 === 0);
  assert.equal(result.suppressed, false);
  assert.equal(result.suppressed === false && result.rows[0]!.reachedPercent, 40);
});

// --------------------------------------------------------------------- roster

const NOW = new Date('2026-03-01T12:00:00.000Z');
const daysBefore = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

test('a student who has cleared nothing reads as not started', () => {
  assert.equal(activityFlag({ mastered: 0, lastActive: null }, NOW), 'not-started');
  // Even with a timestamp on the row: nothing cleared is the louder fact.
  assert.equal(activityFlag({ mastered: 0, lastActive: daysBefore(1) }, NOW), 'not-started');
});

test('the stale threshold is inclusive of the day it lands on', () => {
  assert.equal(activityFlag({ mastered: 3, lastActive: daysBefore(STALE_DAYS - 1) }, NOW), null);
  assert.equal(activityFlag({ mastered: 3, lastActive: daysBefore(STALE_DAYS) }, NOW), 'stale');
});

test('a missing, unreadable or future timestamp flags nothing', () => {
  assert.equal(activityFlag({ mastered: 3, lastActive: null }, NOW), null);
  assert.equal(activityFlag({ mastered: 3, lastActive: 'not a date' }, NOW), null);
  assert.equal(activityFlag({ mastered: 3, lastActive: daysBefore(-30) }, NOW), null);
});
