import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NEW_COURSE_WINDOW_DAYS,
  isNewCatalogCourse,
  normalizeCatalogCourses,
} from './courseCatalogModel.ts';

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

const NOW = Date.parse('2026-08-28T12:00:00Z');
const daysBefore = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const catalogRow = (over: Partial<Parameters<typeof isNewCatalogCourse>[0]> = {}) => ({
  id: 'course-1',
  kind: 'official' as const,
  isJoined: false,
  publishedAt: daysBefore(1),
  ...over,
});

test('a recently published official course the student has not seen is new', () => {
  assert.equal(isNewCatalogCourse(catalogRow(), new Set(), NOW), true);
});

test('an empty seen set marks nothing that is joined or stale', () => {
  const empty: ReadonlySet<string> = new Set();
  assert.equal(isNewCatalogCourse(catalogRow({ isJoined: true }), empty, NOW), false);
  assert.equal(
    isNewCatalogCourse(catalogRow({ publishedAt: daysBefore(NEW_COURSE_WINDOW_DAYS + 1) }), empty, NOW),
    false,
  );
});

test('a course already seen on this device is not new', () => {
  assert.equal(isNewCatalogCourse(catalogRow(), new Set(['course-1']), NOW), false);
});

test('a course published outside the window is never new', () => {
  assert.equal(
    isNewCatalogCourse(catalogRow({ publishedAt: daysBefore(NEW_COURSE_WINDOW_DAYS + 0.1) }), new Set(), NOW),
    false,
  );
  assert.equal(
    isNewCatalogCourse(catalogRow({ publishedAt: daysBefore(NEW_COURSE_WINDOW_DAYS - 0.1) }), new Set(), NOW),
    true,
  );
});

test('community rows and unreadable publish times are never new', () => {
  assert.equal(isNewCatalogCourse(catalogRow({ kind: 'community' }), new Set(), NOW), false);
  assert.equal(isNewCatalogCourse(catalogRow({ publishedAt: 'whenever' }), new Set(), NOW), false);
});
