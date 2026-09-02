import assert from 'node:assert/strict';
import test from 'node:test';

import { convergenceDisplayStatus, displayStatus, edgeDisplayStatus } from './nodeVisualState.ts';

test('available work becomes in progress only after some mission XP is claimed', () => {
  assert.equal(displayStatus('available', 0), 'available');
  assert.equal(displayStatus('available', 0.5), 'in_progress');
  assert.equal(displayStatus('mastered', 1), 'mastered');
  assert.equal(displayStatus('locked', 0.5), 'locked');
});

test('each prerequisite edge lights independently while a convergence stays locked', () => {
  assert.equal(edgeDisplayStatus('mastered', 'locked', 0), 'active');
  assert.equal(edgeDisplayStatus('available', 'locked', 0), 'locked');
  assert.equal(convergenceDisplayStatus('locked', 0), 'locked');
  assert.equal(convergenceDisplayStatus('available', 0), 'active');
  assert.equal(edgeDisplayStatus('mastered', 'available', 0.4), 'in-progress');
  assert.equal(edgeDisplayStatus('mastered', 'mastered', 1), 'completed');
});
