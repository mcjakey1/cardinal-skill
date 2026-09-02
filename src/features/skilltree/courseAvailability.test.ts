import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CourseUnavailableError,
  requireAvailableCourse,
} from './courseAvailability.ts';

test('a deleted course cannot reappear as an untitled empty chart', () => {
  assert.throws(
    () => requireAvailableCourse(null, 0),
    CourseUnavailableError,
  );
});

test('a real blank course remains available for its first authored node', () => {
  const course = { title: 'Blank Practice Course' };
  assert.equal(requireAvailableCourse(course, 0), course);
});

test('a visible legacy chart keeps drawing when only its title row is hidden', () => {
  assert.equal(requireAvailableCourse(null, 3), null);
});
