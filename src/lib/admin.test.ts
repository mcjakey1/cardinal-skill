import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_PASSWORD,
  ADMIN_POWERS,
  adminPasswordMatches,
  adminUnlocked,
  lockAdmin,
  unlockAdmin,
} from './admin.ts';

test('the password matches itself, trimmed, and nothing else', () => {
  assert.equal(adminPasswordMatches(ADMIN_PASSWORD), true);
  assert.equal(adminPasswordMatches(`  ${ADMIN_PASSWORD} `), true);
  assert.equal(adminPasswordMatches(''), false);
  assert.equal(adminPasswordMatches('   '), false);
  assert.equal(adminPasswordMatches('12345'), false);
  assert.equal(adminPasswordMatches('1234567'), false);
  assert.equal(adminPasswordMatches('123 456'), false);
});

test('a wrong password leaves the area locked', () => {
  lockAdmin();
  assert.equal(unlockAdmin('nope'), false);
  assert.equal(adminUnlocked(), false);
});

test('the right password unlocks for the session, and locking closes it again', () => {
  lockAdmin();
  assert.equal(unlockAdmin(ADMIN_PASSWORD), true);
  assert.equal(adminUnlocked(), true);

  // Already open: a later wrong attempt must not slam the door on someone who
  // is mid-way through the section.
  assert.equal(unlockAdmin('nope'), true);
  assert.equal(adminUnlocked(), true);

  lockAdmin();
  assert.equal(adminUnlocked(), false);
});

test('the promised powers are stated, not implied', () => {
  assert.equal(ADMIN_POWERS.length, 5);
  for (const power of ADMIN_POWERS) {
    assert.ok(power.length > 20, `too terse to be honest: ${power}`);
    assert.ok(power.endsWith('.'), `not a sentence: ${power}`);
  }
});
