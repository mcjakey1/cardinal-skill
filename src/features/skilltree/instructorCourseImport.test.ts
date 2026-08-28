import assert from 'node:assert/strict';
import test from 'node:test';

import {
  importedCourseTitle,
  instructorImportError,
  syllabusFileAccepted,
  syllabusParseRequest,
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
    instructorImportError({ message: 'That course code is already in use.' }),
    'That course code is already in use.',
  );
  assert.notEqual(instructorImportError({ code: '42501' }), '[object Object]');
  // Postgres names a table; the instructor needs a next step.
  assert.match(
    instructorImportError({ message: 'New row violates row-level security policy for table "courses".' }),
    /Sign out, sign back in/,
  );
});

test('a server that wrote for people keeps its own sentence', () => {
  // publish_official_course raises this with errcode 42501. It knows which of
  // several reasons applied; a generic message for the code would lose that.
  assert.equal(
    instructorImportError({
      code: '42501',
      message: 'Only a verified instructor can publish an official course.',
    }),
    'Only a verified instructor can publish an official course.',
  );
});

const PDF = { name: 'syllabus.pdf', mediaType: 'application/pdf' as const, base64: 'JVBER' };

test('a parse request sends the extracted text and leaves the document behind', () => {
  assert.deepEqual(
    syllabusParseRequest({ courseId: 'course-1', text: '  Week 1 — Describing data  ', document: PDF }),
    { courseId: 'course-1', syllabusText: 'Week 1 — Describing data' },
  );
});

test('a PDF with no readable text layer is sent as the document instead', () => {
  assert.deepEqual(
    syllabusParseRequest({ courseId: 'course-1', text: '   ', document: PDF }),
    {
      courseId: 'course-1',
      documentBase64: 'JVBER',
      documentMediaType: 'application/pdf',
      documentName: 'syllabus.pdf',
    },
  );
});

test('a database code becomes a sentence naming the next step', () => {
  // The exact failure a project running behind migration 0028 produces. Its own
  // message is `column verified_instructors.revoked_at does not exist`, which
  // tells the instructor nothing they can act on.
  const behindMigrations = instructorImportError({
    code: '42703',
    message: 'column verified_instructors.revoked_at does not exist',
  });
  assert.ok(!behindMigrations.includes('revoked_at'), behindMigrations);
  assert.ok(/database updates/.test(behindMigrations), behindMigrations);

  assert.match(instructorImportError({ code: 'PGRST205' }), /database updates/);
});

test('an error the app has no guidance for keeps the server sentence', () => {
  assert.equal(
    instructorImportError(new Error('That syllabus is too long to process. Split it and try again.')),
    'That syllabus is too long to process. Split it and try again.',
  );
  assert.match(instructorImportError(undefined), /Check your connection/);
});
