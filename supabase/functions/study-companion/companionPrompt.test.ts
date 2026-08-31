import assert from 'node:assert/strict';
import test from 'node:test';

import { companionSystemPrompt } from './companionPrompt.ts';

test('companion prompt forbids raw display syntax and preserves tutoring guardrails', () => {
  const prompt = companionSystemPrompt({
    courseTitle: 'Discrete Math', nodeTitle: 'Induction', syllabusTopic: 'Proofs',
    learningObjectives: ['Prove identities'], universalSkill: null,
    prerequisites: ['Direct proof'], missions: [{ title: 'Induction task' }],
  });
  assert.match(prompt, /Never use Markdown heading hashes/);
  assert.match(prompt, /Never output raw LaTeX/);
  assert.match(prompt, /Never emit Markdown checkbox syntax/);
  assert.match(prompt, /Never output modern color emoji/);
  assert.match(prompt, /monochrome terminal markers/);
  assert.match(prompt, /intuitive expanded form first/);
  assert.match(prompt, /proper Unicode mathematical glyphs/);
  assert.match(prompt, /Put each major formula or inductive step on its own line/);
  assert.match(prompt, /Do not complete graded work/);
});
