import assert from 'node:assert/strict';
import test from 'node:test';

import { authErrorMessage, buildSession, normalizeSession } from './session.ts';

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
