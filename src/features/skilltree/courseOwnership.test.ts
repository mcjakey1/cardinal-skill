import assert from 'node:assert/strict';
import test from 'node:test';

import { coursesByOwnerType } from './courseOwnership.ts';

test('course tabs separate student uploads from instructor courses', () => {
  const rows = [
    { id: 'student-course', ownerType: 'student' as const },
    { id: 'instructor-course', ownerType: 'instructor' as const },
  ];
  assert.deepEqual(coursesByOwnerType(rows, 'student').map((row) => row.id), ['student-course']);
  assert.deepEqual(coursesByOwnerType(rows, 'instructor').map((row) => row.id), ['instructor-course']);
});
