import assert from 'node:assert/strict';
import test from 'node:test';

import { displayStatus } from './nodeVisualState.ts';

test('available work becomes in progress only after some mission XP is claimed', () => {
  assert.equal(displayStatus('available', 0), 'available');
  assert.equal(displayStatus('available', 0.5), 'in_progress');
  assert.equal(displayStatus('mastered', 1), 'mastered');
  assert.equal(displayStatus('locked', 0.5), 'locked');
});
