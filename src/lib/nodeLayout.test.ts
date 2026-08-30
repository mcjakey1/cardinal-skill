import assert from 'node:assert/strict';
import test from 'node:test';

import { nodeLayoutStorageKey } from './nodeLayoutKey.ts';

test('node layouts use the documented per-course AsyncStorage key', () => {
  assert.equal(nodeLayoutStorageKey('course-42'), '@cardinal_layout_course-42');
});
