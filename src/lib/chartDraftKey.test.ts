import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chartDraftStorageKey } from './chartDraftKey.ts';

test('chart drafts use the documented per-course AsyncStorage key', () => {
  assert.equal(chartDraftStorageKey('abc'), 'cardinal.chart-draft.v1.abc');
});
