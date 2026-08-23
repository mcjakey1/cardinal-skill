import assert from 'node:assert/strict';
import test from 'node:test';

import { COURSES_CACHE_KEY, courseTreeCacheKey } from './courseCacheKeys.ts';

test('parsed courses use the documented device cache keys', () => {
  assert.equal(COURSES_CACHE_KEY, '@cardinal_courses');
  assert.equal(courseTreeCacheKey('CPE111'), '@cardinal_nodes_CPE111');
});
