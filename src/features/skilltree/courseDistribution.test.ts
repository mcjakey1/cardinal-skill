import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCourseDistribution, PRIVATE_PRACTICE_DISTRIBUTION } from './courseDistribution.ts';

test('legacy and malformed course rows stay private practice courses', () => {
  assert.deepEqual(normalizeCourseDistribution({}), PRIVATE_PRACTICE_DISTRIBUTION);
  assert.deepEqual(normalizeCourseDistribution({
    course_kind: 'global',
    publication_status: 'live',
    discoverability: 'everyone',
    source_course_id: 42,
  }), PRIVATE_PRACTICE_DISTRIBUTION);
});

test('valid official and community distribution fields survive normalization', () => {
  assert.deepEqual(normalizeCourseDistribution({
    course_kind: 'community',
    publication_status: 'published',
    discoverability: 'unlisted',
    source_course_id: 'source-id',
  }), {
    kind: 'community',
    publicationStatus: 'published',
    discoverability: 'unlisted',
    sourceCourseId: 'source-id',
  });
});

test('unsafe cached distribution combinations collapse to a valid private state', () => {
  assert.deepEqual(normalizeCourseDistribution({
    course_kind: 'practice',
    publication_status: 'published',
    discoverability: 'public',
    source_course_id: 'source-id',
  }), { ...PRIVATE_PRACTICE_DISTRIBUTION, sourceCourseId: 'source-id' });
  assert.deepEqual(normalizeCourseDistribution({
    course_kind: 'official',
    publication_status: 'draft',
    discoverability: 'public',
  }), {
    kind: 'official',
    publicationStatus: 'draft',
    discoverability: 'private',
    sourceCourseId: null,
  });
});
