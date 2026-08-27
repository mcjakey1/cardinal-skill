import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCatalogCourses } from './courseCatalogModel.ts';

test('catalog normalization keeps only published official or community rows', () => {
  assert.deepEqual(normalizeCatalogCourses([
    {
      course_id: 'course-1',
      title: 'Discrete Mathematics',
      course_kind: 'official',
      published_at: '2026-08-27T00:00:00Z',
      learner_count: '12',
      is_joined: true,
    },
    { course_id: 'bad', title: 'Private', course_kind: 'practice', published_at: 'now' },
    { course_id: 'blank', title: '  ', course_kind: 'community', published_at: 'now' },
  ]), [{
    id: 'course-1',
    courseCode: null,
    title: 'Discrete Mathematics',
    term: null,
    description: '',
    units: null,
    kind: 'official',
    ownerDisplayName: 'Verified instructor',
    learnerCount: 12,
    isJoined: true,
    publishedAt: '2026-08-27T00:00:00Z',
  }]);
});

test('catalog normalization clamps untrusted counts and preserves attribution', () => {
  const [course] = normalizeCatalogCourses([{
    course_id: 'community-1',
    title: '  Signals Drill Pack  ',
    course_kind: 'community',
    owner_display_name: '  Alex  ',
    learner_count: -20,
    units: '3',
    published_at: '2026-08-27T00:00:00Z',
  }]);
  assert.equal(course?.ownerDisplayName, 'Alex');
  assert.equal(course?.learnerCount, 0);
  assert.equal(course?.units, 3);
});
