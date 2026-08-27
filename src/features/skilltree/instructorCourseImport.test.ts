import assert from 'node:assert/strict';
import test from 'node:test';

import {
  importedCourseTitle,
  instructorImportError,
  syllabusFileAccepted,
} from './instructorCourseImport.ts';

test('syllabus files accept PDF, text and Markdown only', () => {
  assert.equal(syllabusFileAccepted('course.PDF'), true);
  assert.equal(syllabusFileAccepted('course.txt'), true);
  assert.equal(syllabusFileAccepted('course.md'), true);
  assert.equal(syllabusFileAccepted('course.docx'), false);
});

test('an import title prefers the override, then the file stem', () => {
  assert.equal(importedCourseTitle('  Statistics 101 ', 'ignored.pdf'), 'Statistics 101');
  assert.equal(importedCourseTitle('', 'Discrete Mathematics.pdf'), 'Discrete Mathematics');
  assert.equal(importedCourseTitle('', null), 'Imported course');
});

test('structured Supabase failures remain readable', () => {
  assert.equal(
    instructorImportError({ message: 'New row violates row-level security.' }),
    'New row violates row-level security.',
  );
  assert.notEqual(instructorImportError({ code: '42501' }), '[object Object]');
});
