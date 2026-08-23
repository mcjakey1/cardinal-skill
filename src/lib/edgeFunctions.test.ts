import assert from 'node:assert/strict';
import test from 'node:test';

import { edgeErrorMessage } from './edgeFunctionError.ts';

test('preserves actionable JSON errors returned by Edge Functions', () => {
  assert.equal(
    edgeErrorMessage({ error: 'The model is not configured.' }, 'Fallback'),
    'The model is not configured.',
  );
  assert.equal(edgeErrorMessage({}, 'Fallback'), 'Fallback');
});

test('bounds non-JSON provider errors before showing them in the UI', () => {
  assert.equal(edgeErrorMessage('  upstream unavailable  ', 'Fallback'), 'upstream unavailable');
  assert.equal(edgeErrorMessage('x'.repeat(800), 'Fallback').length, 500);
});
