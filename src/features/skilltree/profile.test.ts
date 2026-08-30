import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EMPTY_PROFILE, isComplete, validateProfile } from './profile.ts';
import type { StudentProfile } from './types';

function profile(extra: Partial<StudentProfile> = {}): StudentProfile {
  return {
    ...EMPTY_PROFILE,
    fullName: 'Ada Lovelace',
    email: 'ada@example.edu',
    studentNumber: 'S1234567',
    ...extra,
  };
}

test('a filled-in profile has nothing to complain about', () => {
  assert.deepEqual(validateProfile(profile()), {});
});

test('a name is required, because everything else is addressed to it', () => {
  const errors = validateProfile(profile({ fullName: '   ' }));

  assert.ok(errors.fullName, 'expected a message on fullName');
});

test('an address without an @ is rejected', () => {
  assert.ok(validateProfile(profile({ email: 'ada.example.edu' })).email);
});

test('an address without a dot in its domain is rejected', () => {
  // "ada@localhost" parses as an address but cannot receive course mail.
  assert.ok(validateProfile(profile({ email: 'ada@localhost' })).email);
});

test('an address with spaces is rejected', () => {
  assert.ok(validateProfile(profile({ email: 'ada lovelace@example.edu' })).email);
});

test('the optional fields stay optional', () => {
  const errors = validateProfile(profile({ program: '', campus: '', yearLevel: '' }));

  assert.deepEqual(errors, {}, 'a student who has not filled these in is not in error');
});

test('a year level is text, so a foundation year is sayable', () => {
  // The prototype had this as a number, which cannot hold the answers people
  // actually give.
  assert.deepEqual(validateProfile(profile({ yearLevel: 'Foundation' })), {});
});

test('an over-long field is rejected rather than silently truncated', () => {
  const errors = validateProfile(profile({ fullName: 'a'.repeat(200) }));

  assert.ok(errors.fullName);
});

test('an empty profile is not complete, and a filled one is', () => {
  assert.equal(isComplete(EMPTY_PROFILE), false);
  assert.equal(isComplete(profile()), true);
});
