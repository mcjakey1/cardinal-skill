import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_PASSWORD,
  ADMIN_POWERS,
  addableAccounts,
  adminActionMessage,
  adminCourseActions,
  authorableCourses,
  adminPasswordMatches,
  adminUnlocked,
  lockAdmin,
  unlockAdmin,
} from './admin.ts';

test('the password matches itself, trimmed, and nothing else', () => {
  assert.equal(adminPasswordMatches(ADMIN_PASSWORD), true);
  assert.equal(adminPasswordMatches(`  ${ADMIN_PASSWORD} `), true);
  assert.equal(adminPasswordMatches(''), false);
  assert.equal(adminPasswordMatches('   '), false);
  assert.equal(adminPasswordMatches('12345'), false);
  assert.equal(adminPasswordMatches('1234567'), false);
  assert.equal(adminPasswordMatches('123 456'), false);
});

test('a wrong password leaves the area locked', () => {
  lockAdmin();
  assert.equal(unlockAdmin('nope'), false);
  assert.equal(adminUnlocked(), false);
});

test('the right password unlocks for the session, and locking closes it again', () => {
  lockAdmin();
  assert.equal(unlockAdmin(ADMIN_PASSWORD), true);
  assert.equal(adminUnlocked(), true);

  // Already open: a later wrong attempt must not slam the door on someone who
  // is mid-way through the section.
  assert.equal(unlockAdmin('nope'), true);
  assert.equal(adminUnlocked(), true);

  lockAdmin();
  assert.equal(adminUnlocked(), false);
});

test('the promised powers are stated, not implied', () => {
  assert.equal(ADMIN_POWERS.length, 5);
  for (const power of ADMIN_POWERS) {
    assert.ok(power.length > 20, `too terse to be honest: ${power}`);
    assert.ok(power.endsWith('.'), `not a sentence: ${power}`);
  }
});

// --------------------------------------------------- publication transitions

test('a practice course has nothing an administrator can publish', () => {
  const view = adminCourseActions({ kind: 'practice', publicationStatus: 'draft' });
  assert.deepEqual(view.actions, []);
  assert.match(view.blocked ?? '', /private to its owner/i);
});

test('a shared course is offered every status except the one it is already in', () => {
  const offered = (publicationStatus: 'draft' | 'published' | 'archived') =>
    adminCourseActions({ kind: 'official', publicationStatus })
      .actions.map((a) => a.status)
      .sort();

  assert.deepEqual(offered('draft'), ['archived', 'published']);
  assert.deepEqual(offered('published'), ['archived', 'draft']);
  assert.deepEqual(offered('archived'), ['draft', 'published']);
});

test('a community course gets the same three transitions as an official one', () => {
  const community = adminCourseActions({ kind: 'community', publicationStatus: 'published' });
  assert.equal(community.blocked, null);
  assert.deepEqual(
    community.actions.map((a) => a.status).sort(),
    ['archived', 'draft'],
  );
});

test('archiving is the one that promises the student records survive', () => {
  const archive = adminCourseActions({ kind: 'official', publicationStatus: 'published' })
    .actions.find((a) => a.status === 'archived');
  assert.ok(archive, 'archiving must be offered on a published course');
  assert.match(archive.hint, /record/i);
});

// ------------------------------------------------------------ error messages

test('a missing function or table reads as a setup step, not a broken action', () => {
  for (const code of ['PGRST202', '42883', '42P01', 'PGRST205']) {
    const said = adminActionMessage({ code, message: 'schema cache' });
    assert.match(said, /0028/, `${code} should name the migration`);
    assert.match(said, /nothing was changed/i, `${code} should say nothing happened`);
    assert.doesNotMatch(said, /schema cache/i, `${code} leaked the Postgres wording`);
  }
});

test('a refusal keeps the sentence the database refused with', () => {
  assert.equal(
    adminActionMessage({
      code: '42501',
      message: 'Only an administrator can change who is enrolled on a course.',
    }),
    'Only an administrator can change who is enrolled on a course.',
  );
});

test('a refusal with nothing to say still says who it was refused to', () => {
  assert.match(adminActionMessage({ code: '42501' }), /administrator/i);
});

test('an error nobody planned for is passed through rather than dressed up', () => {
  assert.equal(adminActionMessage(new Error('the network went away')), 'the network went away');
  assert.equal(
    adminActionMessage({ code: '23505', message: 'duplicate key value' }),
    'duplicate key value',
  );
});

test('an error with no message at all still produces a sentence', () => {
  for (const nothing of [null, undefined, {}, 'boom']) {
    const said = adminActionMessage(nothing);
    assert.ok(said.length > 0, `empty sentence for ${JSON.stringify(nothing)}`);
    assert.ok(said.endsWith('.'), `not a sentence: ${said}`);
  }
});

// ------------------------------------------------------- workspace scoping

const SITE = [
  { id: 'mine', ownerId: 'me' },
  { id: 'also-mine', ownerId: 'me' },
  { id: 'joined', ownerId: 'someone-else' },
];

test('an instructor authors their own courses and nobody else’s', () => {
  const seen = authorableCourses(SITE, 'me', false);
  assert.deepEqual(seen.map((c) => c.id), ['mine', 'also-mine']);
  assert.ok(seen.every((c) => c.canEdit), 'an owner can edit what they own');
});

test('a course an instructor merely joined is not in their authoring workspace', () => {
  // RLS returns it — they are enrolled on it — and it is still theirs to learn
  // from in the student app. It is just not something they author.
  assert.equal(authorableCourses(SITE, 'me', false).some((c) => c.id === 'joined'), false);
});

test('an administrator sees every course and may edit every one', () => {
  const seen = authorableCourses(SITE, 'me', true);
  assert.deepEqual(seen.map((c) => c.id), ['mine', 'also-mine', 'joined']);
  assert.ok(seen.every((c) => c.canEdit), 'an administrator authors any course');
});

test('an administrator who owns nothing still gets the whole site', () => {
  const seen = authorableCourses(SITE, 'nobody', true);
  assert.equal(seen.length, 3);
  assert.ok(seen.every((c) => c.canEdit));
});

test('no signed-in account authors nothing, rather than everything', () => {
  assert.deepEqual(authorableCourses(SITE, null, false), []);
});

test('the incoming order is kept', () => {
  assert.deepEqual(
    authorableCourses([...SITE].reverse(), 'me', true).map((c) => c.id),
    ['joined', 'also-mine', 'mine'],
  );
});

// ------------------------------------------------------ who can still be added

const ACCOUNTS = [
  { userId: 'a', displayName: 'A' },
  { userId: 'b', displayName: 'B' },
  { userId: 'c', displayName: 'C' },
];

test('somebody already on the course is not offered again', () => {
  const addable = addableAccounts(ACCOUNTS, [{ userId: 'b', enrolled: true }]);
  assert.deepEqual(addable.map((a) => a.userId), ['a', 'c']);
});

test('a roster row that is only a registered account is still addable', () => {
  // `course_roster` lists unenrolled accounts when nobody is on the course.
  // Appearing there is not being on it, and the difference is the whole panel.
  const addable = addableAccounts(ACCOUNTS, [
    { userId: 'a', enrolled: false },
    { userId: 'b', enrolled: false },
  ]);
  assert.deepEqual(addable.map((a) => a.userId), ['a', 'b', 'c']);
});

test('an empty course can be given anybody', () => {
  assert.deepEqual(addableAccounts(ACCOUNTS, []).map((a) => a.userId), ['a', 'b', 'c']);
});

test('a full course offers nobody', () => {
  const everyone = ACCOUNTS.map((a) => ({ userId: a.userId, enrolled: true }));
  assert.deepEqual(addableAccounts(ACCOUNTS, everyone), []);
});

test('the directory order is kept', () => {
  assert.deepEqual(
    addableAccounts([...ACCOUNTS].reverse(), [{ userId: 'b', enrolled: true }]).map((a) => a.userId),
    ['c', 'a'],
  );
});
