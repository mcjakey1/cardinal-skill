import assert from 'node:assert/strict';
import test from 'node:test';

import { demoCompanionAnswer } from './demoCompanion.ts';

test('demo companion copy is deterministic and uses renderer-safe math', () => {
  const answer = demoCompanionAnswer('Direct & Contrapositive Proofs', 'Explain step-by-step');
  assert.match(answer, /n² = \(2m\)² = 4m²/);
  assert.doesNotMatch(answer, /\\(?:frac|\(|\[)|^#/m);
});

test('demo companion can produce a concise practice check', () => {
  assert.match(demoCompanionAnswer('Direct Proofs', 'Give me a quiz'), /QUICK SELF-CHECK:/);
});

test('demo companion explanation follows the selected node', () => {
  const answer = demoCompanionAnswer('Logic Foundations', 'Explain it simply');
  assert.match(answer, /proposition is a statement/i);
  assert.match(answer, /p → q/);
  assert.doesNotMatch(answer, /even integer/i);
});
