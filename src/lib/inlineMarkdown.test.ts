import assert from 'node:assert/strict';
import test from 'node:test';

import { parseInlineMarkdown } from './inlineMarkdown.ts';

test('parses strong, emphasis, and code without losing paragraph spacing', () => {
  assert.deepEqual(
    parseInlineMarkdown('Use **standard deviation** for *spread*.\n\nTry `s = 2`.') ,
    [
      { kind: 'text', text: 'Use ' },
      { kind: 'strong', text: 'standard deviation' },
      { kind: 'text', text: ' for ' },
      { kind: 'emphasis', text: 'spread' },
      { kind: 'text', text: '.\n\nTry ' },
      { kind: 'code', text: 's = 2' },
      { kind: 'text', text: '.' },
    ],
  );
});

test('keeps unmatched markers and supports escaped Markdown characters', () => {
  assert.deepEqual(parseInlineMarkdown('A **partial and \\*literal\\* marker'), [
    { kind: 'text', text: 'A **partial and *literal* marker' },
  ]);
});
