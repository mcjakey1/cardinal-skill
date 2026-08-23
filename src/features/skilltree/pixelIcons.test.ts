import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePixelIcon } from './pixelIcons.ts';

test('uses a valid parser-selected icon before keyword fallback', () => {
  assert.equal(
    resolvePixelIcon({ iconKey: 'pixel_coin', title: 'Probability', kind: 'topic' }),
    'pixel_coin',
  );
});

test('maps common syllabus subjects to contextual pixel icons', () => {
  assert.equal(resolvePixelIcon({ title: 'Sampling arrays', kind: 'topic' }), 'pixel_grid');
  assert.equal(resolvePixelIcon({ title: 'Final exam', kind: 'assessment' }), 'pixel_trophy');
  assert.equal(resolvePixelIcon({ title: 'Pointers in C', kind: 'topic' }), 'pixel_cursor_arrow');
});

test('falls back to a readable theory glyph', () => {
  assert.equal(resolvePixelIcon({ title: 'General theory', kind: 'topic' }), 'pixel_spellbook');
});
