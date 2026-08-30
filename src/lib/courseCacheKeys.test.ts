import assert from 'node:assert/strict';
import test from 'node:test';

import { COURSES_CACHE_KEY, courseTreeCacheKey, isCourseScopedCacheKey } from './courseCacheKeys.ts';

test('parsed courses use the documented device cache keys', () => {
  assert.equal(COURSES_CACHE_KEY, '@cardinal_courses');
  assert.equal(courseTreeCacheKey('CPE111'), '@cardinal_nodes_CPE111');
});

test('sign-out clears every key that holds one account course data', () => {
  for (const key of [
    '@cardinal_courses',
    '@cardinal_course_order_v1',
    '@cardinal_nodes_CPE111',
    '@cardinal_layout_CPE111',
    'cardinal.progress.v1.CPE111',
    'cardinal.missions.v1.CPE111',
    'cardinal.mission-unmarks.v1.CPE111',
    'cardinal.mission-sync.v1.CPE111',
    'cardinal.questnames.v1.CPE111',
    'cardinal.signals.v1.CPE111',
    'cardinal.edited-tree.v1.CPE111',
  ]) {
    assert.equal(isCourseScopedCacheKey(key), true, key);
  }
});

test('an unpublished chart draft is the author work and survives sign-out', () => {
  // Deliberately outside the family it otherwise matches. Everything else in
  // that family is a completion log, and the harm there is specific: it is
  // flushed to the server under whoever signs in next. A draft is never
  // uploaded as anybody — publishing it writes into a course the server checks
  // access to on its own — so clearing it buys almost nothing and costs an
  // instructor every unpublished edit they made before signing out.
  assert.equal(isCourseScopedCacheKey('cardinal.chart-draft.v1.CPE111'), false);
});

test('account data with no course in its name is cleared too', () => {
  // Neither of these carries a course id, so the family pattern above cannot
  // see them — and both describe the person, not the device. Left behind, the
  // next account to sign in on a shared machine reads the previous student's
  // name out of the profile form and finds courses already marked as seen.
  for (const key of ['cardinal.profile.v1', 'cardinal.seencourses.v1']) {
    assert.equal(isCourseScopedCacheKey(key), true, key);
  }
});

test('device settings are not account data and survive sign-out', () => {
  for (const key of [
    'cardinal.prefs.v1',
    'cardinal.theme-preset.v1',
    'cardinal.backdrop.v1:someone',
    'cardinal.auth-session.v1',
  ]) {
    assert.equal(isCourseScopedCacheKey(key), false, key);
  }
});
