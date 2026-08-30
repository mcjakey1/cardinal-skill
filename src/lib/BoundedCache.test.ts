import assert from 'node:assert/strict';
import test from 'node:test';

import { BoundedCache } from './BoundedCache.ts';

test('bounded cache evicts the least recently used entry', () => {
  const cache = new BoundedCache<string, number>(2);
  cache.set('course-a', 1);
  cache.set('course-b', 2);
  assert.equal(cache.get('course-a'), 1);

  cache.set('course-c', 3);

  assert.equal(cache.get('course-b'), undefined);
  assert.equal(cache.get('course-a'), 1);
  assert.equal(cache.get('course-c'), 3);
  assert.equal(cache.size, 2);
});

test('bounded cache rejects a capacity that cannot retain an entry', () => {
  assert.throws(() => new BoundedCache(0), RangeError);
});
