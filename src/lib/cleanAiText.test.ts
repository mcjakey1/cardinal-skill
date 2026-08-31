import assert from 'node:assert/strict';
import test from 'node:test';

import { companionTextBlocks, formatMathExpressions, sanitizeCompanionText } from './cleanAiText.ts';

test('companion cleanup removes markdown headers, checkboxes, and common LaTeX', () => {
  const clean = sanitizeCompanionText(String.raw`### The core idea
- [ ] Show \(P(n)\) for \(n \geq 1\).
\[
1 + 2 + \cdots + n = \frac{n(n+1)}{2}.
\]`);
  assert.equal(clean, `THE CORE IDEA:
• Show P(n) for n ≥ 1.

1 + 2 + ... + n = (n(n + 1) / 2).`);
  assert.doesNotMatch(clean, /\\(?:\(|\[|frac|geq)/);
});

test('companion blocks distinguish headings, lists, equations, and prose', () => {
  assert.deepEqual(companionTextBlocks(`### Steps
- [ ] Base case
2. Inductive step

P(k) ⇒ P(k + 1)

Now apply the result.`), [
    { kind: 'heading', text: 'STEPS:' },
    { kind: 'list', items: [
      { marker: null, text: 'Base case' },
      { marker: '2', text: 'Inductive step' },
    ] },
    { kind: 'equation', text: 'P(k) ⇒ P(k + 1)' },
    { kind: 'paragraph', text: 'Now apply the result.' },
  ]);
});

test('emoji and set notation normalize to monochrome terminal symbols', () => {
  const clean = sanitizeCompanionText(String.raw`➡️ Combine A U B with A \cap B.
💡 Remember \emptyset. ✅ Done. 🚀`);
  assert.equal(clean, `▸ Combine A ∪ B with A ∩ B.
* Remember ∅. [✓] Done.`);
  assert.doesNotMatch(clean, /[➡👉💡✅🚀]/u);
});

test('retro arrow notes become indented semantic blocks', () => {
  assert.deepEqual(companionTextBlocks('1. Union (A U B)\n➡️ Combine every item.'), [
    { kind: 'list', items: [{ marker: '1', text: 'Union (A ∪ B)' }] },
    { kind: 'subnote', text: 'Combine every item.' },
  ]);
});

test('pseudo summations and products become readable Unicode notation', () => {
  assert.equal(
    formatMathExpressions('sum_(i=1)^k+1 f(i) = (sum_(i=1)^k f(i)) + prod_(j=1)^n g(j)'),
    '∑(i = 1 to k + 1) f(i) = (∑(i = 1 to k) f(i)) + ∏(j = 1 to n) g(j)',
  );
});

test('common exponents and subscripts use legible Unicode glyphs', () => {
  assert.equal(
    formatMathExpressions('x^2 + y^3 = 2^n + 2^(k+1) + S_(k+1)'),
    'x² + y³ = 2ⁿ + 2ᵏ⁺¹ + Sₖ₊₁',
  );
});

test('consecutive proof equations share one callout block', () => {
  assert.deepEqual(companionTextBlocks(`INDUCTION STEP FORMULA:
[f(1) + f(2) + ... + f(k)] + f(k+1)
= S_k + f(k+1)`), [
    { kind: 'heading', text: 'INDUCTION STEP FORMULA:' },
    { kind: 'equation', text: '[f(1) + f(2) + ... + f(k)] + f(k + 1)\n= Sₖ + f(k + 1)' },
  ]);
});
