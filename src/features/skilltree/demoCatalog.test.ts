import assert from 'node:assert/strict';
import test from 'node:test';

import { demoCatalog } from './demoCatalog.ts';

test('showcase catalogs use fictional attribution and openable fixture ids', () => {
  const official = demoCatalog('official');
  assert.equal(official.length, 4);
  assert.ok(official.every((course) => course.isJoined && course.ownerDisplayName.length > 0));
  assert.deepEqual(official.map((course) => course.id), ['demo', 'demo-cs201', 'demo-cpe102', 'demo-chem210']);
});

test('community showcase rows stay separate from instructor courses', () => {
  assert.ok(demoCatalog('community').every((course) => course.kind === 'community'));
  assert.deepEqual(demoCatalog(null), []);
});
