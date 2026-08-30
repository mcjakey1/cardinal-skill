import assert from 'node:assert/strict';
import test from 'node:test';

import { isServerId } from './serverIds.ts';

test('a real row id is a uuid and belongs on the server', () => {
  for (const id of [
    'aaaa0001-0000-4000-8000-000000000001',
    'AAAA0001-0000-4000-8000-000000000001',
    '7f4f0388-0aae-4e39-826f-8d7c45a8f678',
  ]) {
    assert.equal(isServerId(id), true, id);
  }
});

test('the example course and its slug missions are not server rows', () => {
  // The whole reason this exists: `demo` and `describing-read` were being sent
  // to `set_mission_completion`, whose parameters are uuid columns. Postgres
  // answered 22P02 on every tick, the queue never drained, and the student saw
  // XP that no server had agreed to.
  for (const id of ['demo', 'describing-read', 'node-1', '']) {
    assert.equal(isServerId(id), false, id);
  }
});

test('a nearly-right id is still refused', () => {
  for (const id of [
    'aaaa0001-0000-4000-8000-00000000000',
    'aaaa0001-0000-4000-8000-0000000000011',
    'gggg0001-0000-4000-8000-000000000001',
    'aaaa000100004000800000000000000 1',
  ]) {
    assert.equal(isServerId(id), false, id);
  }
});
