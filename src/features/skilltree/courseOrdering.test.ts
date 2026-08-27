import assert from 'node:assert/strict';
import test from 'node:test';

import { applySavedCourseOrder, mergeVisibleCourseOrder } from './courseOrdering.ts';
import type { CourseOption } from './courseQueries.ts';

const course = (id: string): CourseOption => ({
  id,
  courseCode: null,
  title: id,
  term: null,
  kind: 'practice',
  publicationStatus: 'draft',
  discoverability: 'private',
  sourceCourseId: null,
  canEdit: true,
  canDelete: true,
  canRemove: false,
  isFixture: false,
  sortOrder: 0,
});

test('filtered reordering preserves hidden slots and recomputes every index', () => {
  const all = ['a', 'hidden-1', 'b', 'hidden-2', 'c'].map(course);
  const visible = [all[4]!, all[2]!, all[0]!];

  const reordered = mergeVisibleCourseOrder(all, visible);

  assert.deepEqual(reordered.map((item) => item.id), ['c', 'hidden-1', 'b', 'hidden-2', 'a']);
  assert.deepEqual(reordered.map((item) => item.sortOrder), [0, 1, 2, 3, 4]);
});

test('device order remains authoritative and appends a newly discovered course', () => {
  const all = ['new-course', 'a', 'b', 'c'].map((id, sortOrder) => ({ ...course(id), sortOrder }));

  const ordered = applySavedCourseOrder(all, ['c', 'a', 'b']);

  assert.deepEqual(ordered.map((item) => item.id), ['c', 'a', 'b', 'new-course']);
  assert.deepEqual(ordered.map((item) => item.sortOrder), [0, 1, 2, 3]);
});
