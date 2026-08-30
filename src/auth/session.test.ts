import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authErrorMessage,
  buildSession,
  normalizeSession,
  resolveSessionRole,
  type RoleEvidence,
  type UserSession,
} from './session.ts';

const STUDENT: UserSession = {
  isAuthenticated: true,
  source: 'supabase',
  role: 'student',
  email: 'teacher@example.edu',
  name: 'Teacher',
};

const NO_EVIDENCE: RoleEvidence = {
  metadataRole: 'student',
  verifiedInstructor: false,
  ownsOfficialCourse: false,
};

test('demo sign-in creates a complete role-specific session from empty credentials', () => {
  assert.deepEqual(buildSession({ role: 'student', email: '' }), {
    isAuthenticated: true,
    source: 'demo',
    role: 'student',
    email: 'student@demo.cardinal.local',
    name: 'student',
  });
});

test('persisted session input is validated before hydration', () => {
  assert.equal(normalizeSession({ role: 'admin', email: 'x', name: 'x' }), null);
  assert.equal(normalizeSession({ role: 'student', email: 'legacy@example.edu', name: 'Legacy' }), null);
  assert.deepEqual(normalizeSession({ source: 'supabase', role: 'instructor', email: 'i@example.edu', name: 'I' }), {
    isAuthenticated: true,
    source: 'supabase',
    role: 'instructor',
    email: 'i@example.edu',
    name: 'I',
  });
});

test('Supabase auth failures tell the user how to recover', () => {
  assert.equal(
    authErrorMessage('Invalid login credentials'),
    'That email and password do not match. Check them and try again.',
  );
  assert.match(authErrorMessage('Email not confirmed'), /Confirm your email/);
});

test('the server overrules a session that signed in through the wrong tab', () => {
  const verified = resolveSessionRole(STUDENT, { ...NO_EVIDENCE, verifiedInstructor: true });
  assert.equal(verified?.role, 'instructor');
  const owner = resolveSessionRole(STUDENT, { ...NO_EVIDENCE, ownsOfficialCourse: true });
  assert.equal(owner?.role, 'instructor');
  const signedUp = resolveSessionRole(STUDENT, { ...NO_EVIDENCE, metadataRole: 'instructor' });
  assert.equal(signedUp?.role, 'instructor');
});

test('a session the server agrees with is returned untouched', () => {
  assert.equal(resolveSessionRole(STUDENT, NO_EVIDENCE), STUDENT);
  const instructor: UserSession = { ...STUDENT, role: 'instructor' };
  assert.equal(
    resolveSessionRole(instructor, { ...NO_EVIDENCE, verifiedInstructor: true }),
    instructor,
  );
});

test('a claimed instructor becomes a student when the server finds no instructor evidence', () => {
  const instructor: UserSession = { ...STUDENT, role: 'instructor' };
  assert.equal(resolveSessionRole(instructor, NO_EVIDENCE)?.role, 'student');
});

test('a demo instructor keeps its role with no server to ask', () => {
  const demo: UserSession = { ...STUDENT, source: 'demo', role: 'instructor' };
  assert.equal(resolveSessionRole(demo, null), demo);
  assert.equal(resolveSessionRole(demo, NO_EVIDENCE), demo);
});

test('a signed-out or unreachable account resolves to nothing to correct', () => {
  assert.equal(resolveSessionRole(null, NO_EVIDENCE), null);
  assert.equal(resolveSessionRole(STUDENT, null), STUDENT);
});
