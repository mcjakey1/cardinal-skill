import assert from 'node:assert/strict';
import test from 'node:test';

import { catalogKindForTab, playgroundCourses } from './courseLibrary.ts';
import type { CourseOption } from './courseQueries.ts';

function course(id: string, kind: CourseOption['kind'], canEdit: boolean): CourseOption {
  return {
    id,
    kind,
    canEdit,
    courseCode: null,
    title: id,
    term: null,
    publicationStatus: kind === 'practice' ? 'draft' : 'published',
    discoverability: kind === 'practice' ? 'private' : 'public',
    sourceCourseId: null,
    canDelete: canEdit,
    canRemove: !canEdit,
    isFixture: false,
    sortOrder: 0,
  };
}

function fixture(id: string): CourseOption {
  return { ...course(id, 'practice', false), isFixture: true };
}

test('course tabs route My courses to official and Playground to local content', () => {
  assert.equal(catalogKindForTab('mine'), 'official');
  assert.equal(catalogKindForTab('playground'), null);
  assert.equal(catalogKindForTab('community'), 'community');
});

test('Playground keeps owned drafts, student publications, and bundled showcase courses', () => {
  const result = playgroundCourses([
    course('private', 'practice', true),
    course('shared', 'community', true),
    course('joined-community', 'community', false),
    course('official', 'official', true),
    fixture('showcase'),
  ]);
  assert.deepEqual(result.map(({ id }) => id), ['private', 'shared', 'showcase']);
});
