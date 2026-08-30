import assert from 'node:assert/strict';
import test from 'node:test';

import { withTimeout } from './timeout.ts';

test('an auth request that finishes before its deadline keeps its result', async () => {
  assert.equal(await withTimeout(Promise.resolve('signed in'), 50, 'too slow'), 'signed in');
});

test('an auth request that never settles reaches a recoverable deadline', async () => {
  await assert.rejects(
    withTimeout(new Promise<never>(() => {}), 5, 'Supabase took too long.'),
    /Supabase took too long/,
  );
});
