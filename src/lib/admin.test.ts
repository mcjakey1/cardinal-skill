import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_PASSWORD,
  ADMIN_POWERS,
  EMPTY_AUDIT_FILTER,
  addableAccounts,
  administratorRoster,
  appendAuditPage,
  auditCsv,
  auditCsvFilename,
  auditSummary,
  auditFilterActive,
  auditQueryParams,
  nextAuditCursor,
  describeAuditAction,
  describeAuditFilter,
  adminActionMessage,
  adminCourseActions,
  authorableCourses,
  adminPasswordMatches,
  adminUnlocked,
  lockAdmin,
  unlockAdmin,
} from './admin.ts';
import type { AuditEntry } from './admin.ts';

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
    assert.match(said, /database update/i, `${code} should name it a setup step`);
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

test('the owner of the course is not offered as a student to add', () => {
  // They already own it. Offering it reads as "this person is missing from
  // their own course", which is the one thing the list must never suggest.
  const addable = addableAccounts(ACCOUNTS, [], ['b']);
  assert.deepEqual(addable.map((a) => a.userId), ['a', 'c']);
});

test('a co-instructor is not offered again either', () => {
  // `course_roster` returns only role 'student', so an instructor enrolment is
  // invisible to the roster and would otherwise stay on the add list forever.
  const addable = addableAccounts(ACCOUNTS, [{ userId: 'a', enrolled: true }], ['c', null]);
  assert.deepEqual(addable.map((a) => a.userId), ['b']);
});

// -------------------------------------------------------- who holds the keys

test('administrators come first, then everybody else, each by name', () => {
  const roster = administratorRoster(
    [
      { userId: 'c', displayName: 'Carla' },
      { userId: 'a', displayName: 'Ada' },
      { userId: 'b', displayName: 'Bo' },
    ],
    [
      { userId: 'c', grantedAt: '2026-01-02T00:00:00Z', self: false },
      { userId: 'a', grantedAt: '2026-01-01T00:00:00Z', self: true },
    ],
  );
  assert.deepEqual(
    roster.map((row) => [row.displayName, row.isAdmin, row.self]),
    [['Ada', true, true], ['Carla', true, false], ['Bo', false, false]],
  );
  assert.equal(roster[0]?.grantedAt, '2026-01-01T00:00:00Z');
});

test('an administrator with no profile row is still listed', () => {
  // The whole point of the panel is "who else holds the keys". An account the
  // directory cannot name is exactly the one an auditor must still see.
  const roster = administratorRoster([{ userId: 'a', displayName: 'Ada' }], [
    { userId: 'ghost', grantedAt: '2026-01-01T00:00:00Z', self: false },
  ]);
  assert.deepEqual(roster.map((row) => [row.userId, row.isAdmin]), [['ghost', true], ['a', false]]);
});

test('the directory order is kept', () => {
  assert.deepEqual(
    addableAccounts([...ACCOUNTS].reverse(), [{ userId: 'b', enrolled: true }]).map((a) => a.userId),
    ['c', 'a'],
  );
});


// -------------------------------------------------------------- the audit log

type AuditFields = Parameters<typeof describeAuditAction>[0];

const entry = (over: Partial<AuditFields> = {}): AuditFields => ({
  action: 'course.archived',
  subjectName: null,
  courseTitle: 'Statistics 101',
  detail: {},
  ...over,
});

test('every action an administrator can take reads as a sentence', () => {
  const said = (over: Partial<AuditFields>) => describeAuditAction(entry(over));

  assert.equal(said({ action: 'course.published' }), 'Published Statistics 101');
  assert.equal(said({ action: 'course.archived' }), 'Archived Statistics 101');
  assert.equal(
    said({ action: 'course.unpublished' }),
    'Took Statistics 101 out of the catalog',
  );
  assert.equal(
    said({ action: 'instructor.verified', subjectName: 'A. Reyes' }),
    'Gave A. Reyes a verified instructor badge',
  );
  assert.equal(
    said({ action: 'instructor.revoked', subjectName: 'A. Reyes' }),
    'Revoked the verified instructor badge from A. Reyes',
  );
  assert.equal(
    said({ action: 'enrollment.added', subjectName: 'A. Reyes' }),
    'Added A. Reyes to Statistics 101',
  );
  assert.equal(
    said({ action: 'enrollment.removed', subjectName: 'A. Reyes' }),
    'Removed A. Reyes from Statistics 101',
  );
  assert.equal(
    said({ action: 'administrator.granted', subjectName: 'A. Reyes' }),
    'Made A. Reyes an administrator',
  );
  assert.equal(
    said({ action: 'administrator.revoked', subjectName: 'A. Reyes' }),
    'Removed A. Reyes as an administrator',
  );
});

test('a publication change says what the course was before', () => {
  assert.equal(
    describeAuditAction(entry({ action: 'course.archived', detail: { was: 'published' } })),
    'Archived Statistics 101, which was published',
  );
});

test('a change that altered nothing does not claim it did', () => {
  // Archiving something already archived is a real thing to do by accident, and
  // the log should not read as though the catalog changed.
  assert.equal(
    describeAuditAction(entry({ action: 'course.archived', detail: { was: 'archived' } })),
    'Archived Statistics 101',
  );
});

test('a mission edit names the mission, and the name it had', () => {
  assert.equal(
    describeAuditAction(entry({ action: 'mission.edited', detail: { mission: 'Sampling frames' } })),
    'Edited Sampling frames in Statistics 101',
  );
  assert.equal(
    describeAuditAction(
      entry({
        action: 'mission.edited',
        detail: { mission: 'Sampling frames II', was: 'Sampling frames' },
      }),
    ),
    'Edited Sampling frames II in Statistics 101, which was Sampling frames',
  );
});

test('a publish that only repaired XP still says what it did', () => {
  assert.equal(
    describeAuditAction(entry({ action: 'chart.published', detail: { xp_repaired: 2 } })),
    "Published the chart of Statistics 101: 2 nodes' XP corrected",
  );
});

test('an action whose target is gone still reads', () => {
  assert.equal(
    describeAuditAction(entry({ action: 'course.published', courseTitle: null })),
    'Published a deleted course',
  );
  assert.equal(
    describeAuditAction(entry({ action: 'administrator.granted', subjectName: null })),
    'Made a deleted account an administrator',
  );
});

test('an action this build does not know is still shown, not invented', () => {
  // A newer migration can add one. Printing the raw name is honest; guessing a
  // sentence for it would put words in an administrator's mouth.
  assert.equal(describeAuditAction(entry({ action: 'course.frobnicated' })), 'course.frobnicated');
  // Recognising most of a family is not recognising the family. An unknown
  // action that shares a prefix with five known ones must not be matched on the
  // prefix and described as one of them.
  assert.equal(describeAuditAction(entry({ action: 'course.merged' })), 'course.merged');
  assert.equal(describeAuditAction(entry({ action: 'chart.reverted' })), 'chart.reverted');
  assert.equal(
    describeAuditAction(entry({ action: 'enrollment.suspended' })),
    'enrollment.suspended',
  );
});

test('a new course names itself and its author’s act', () => {
  assert.equal(describeAuditAction(entry({ action: 'course.created' })), 'Created Statistics 101');
});

test('a deleted course still names itself, from what was written down at the time', () => {
  // A delete row carries no course id — the foreign key refuses one that is
  // gone — so the title is the copy the server took at the moment it happened.
  // Without that copy the row reads "Deleted a deleted course", which is the
  // one sentence this record must never produce.
  assert.equal(describeAuditAction(entry({ action: 'course.deleted' })), 'Deleted Statistics 101');
  assert.equal(
    describeAuditAction(entry({ action: 'course.deleted', courseTitle: null })),
    'Deleted a deleted course',
  );
});

test('taking a course over names the instructor who lost it', () => {
  // The whole point of recording this one is the person no longer named
  // anywhere on the course. A sentence that said only who holds it now would
  // read as ordinary administration.
  assert.equal(
    describeAuditAction(entry({
      action: 'course.owner_changed',
      subjectName: 'M. Okafor',
      courseTitle: 'Statistics 101',
      detail: { was_name: 'A. Reyes' },
    })),
    'Made M. Okafor the owner of Statistics 101, taken from A. Reyes',
  );
});

test('a course taken from an erased account still reads', () => {
  assert.equal(
    describeAuditAction(entry({
      action: 'course.owner_changed',
      subjectName: 'M. Okafor',
      courseTitle: 'Statistics 101',
      detail: {},
    })),
    'Made M. Okafor the owner of Statistics 101',
  );
});

test('a rename says what the course used to be called', () => {
  assert.equal(
    describeAuditAction(entry({
      action: 'course.renamed',
      courseTitle: 'Stats 101',
      detail: { was: 'Statistics 101' },
    })),
    'Renamed Stats 101, which was Statistics 101',
  );
});

test('a chart publish says how much of the tree moved', () => {
  assert.equal(
    describeAuditAction(entry({
      action: 'chart.published',
      detail: { nodes_inserted: 3, nodes_archived: 2, missions_upserted: 4 },
    })),
    'Published the chart of Statistics 101: 3 nodes added, 2 nodes hidden, 4 missions saved',
  );
});

test('a chart publish that touched one node does not say “1 nodes”', () => {
  assert.equal(
    describeAuditAction(entry({ action: 'chart.published', detail: { nodes_inserted: 1 } })),
    'Published the chart of Statistics 101: 1 node added',
  );
});

test('a role change says what the person was and what they are now', () => {
  assert.equal(
    describeAuditAction(entry({
      action: 'enrollment.role_changed',
      subjectName: 'A. Reyes',
      detail: { from: 'student', to: 'instructor' },
    })),
    'Changed A. Reyes from student to instructor on Statistics 101',
  );
});

// ---------------------------------------------------------- asking narrower

test('an untouched filter asks the server for no narrowing at all', () => {
  assert.deepEqual(auditQueryParams(EMPTY_AUDIT_FILTER, null), {
    p_actor: null,
    p_actions: null,
    p_from: null,
    p_to: null,
    p_search: null,
    p_subject_user: null,
    p_subject_course: null,
    p_before_at: null,
    p_before_id: null,
    p_limit: 100,
  });
});

test('a blank search is sent as nothing, not as an empty string', () => {
  // `ilike '%   %'` matches almost nothing, so a box holding only a space would
  // read as "the record is empty" rather than "you typed nothing".
  const params = auditQueryParams({ ...EMPTY_AUDIT_FILTER, search: '   ' }, null);
  assert.equal(params.p_search, null);
});

test('a date range is sent as whole days, with the last day included', () => {
  const params = auditQueryParams(
    { ...EMPTY_AUDIT_FILTER, from: '2026-08-01', to: '2026-08-31' },
    null,
  );
  const from = new Date(params.p_from ?? '');
  const to = new Date(params.p_to ?? '');

  assert.deepEqual(
    [from.getFullYear(), from.getMonth(), from.getDate(), from.getHours(), from.getMinutes()],
    [2026, 7, 1, 0, 0],
  );
  // Not the first instant of the 31st. A reader who types the 31st means the
  // whole of it, and a range stopping at midnight would hide a working day.
  assert.deepEqual(
    [to.getFullYear(), to.getMonth(), to.getDate(), to.getHours(), to.getMinutes()],
    [2026, 7, 31, 23, 59],
  );
});

test('a date range covers the reader’s own day, not a day in Greenwich', () => {
  // Measured from a Central desk: UTC day boundaries turned 1-15 September into
  // 31 Aug 19:00 - 15 Sep 18:59 local, so the last evening of add/drop fell out
  // of the range and a row stamped 31 August appeared inside a filter whose own
  // head said "from 2026-09-01". Read through the local getters, so this holds
  // whatever zone the machine running it sits in.
  const params = auditQueryParams(
    { ...EMPTY_AUDIT_FILTER, from: '2026-09-01', to: '2026-09-15' },
    null,
  );
  const from = new Date(params.p_from ?? '');
  const to = new Date(params.p_to ?? '');

  assert.equal(from.getDate(), 1);
  assert.equal(from.getHours(), 0);
  assert.equal(to.getDate(), 15);
  assert.equal(to.getHours(), 23);
});

test('a range typed backwards is sent in the order the server can use', () => {
  // Two date boxes get filled in the wrong order routinely. Returning nothing
  // would read as "nothing happened that month", which is a different answer
  // from the one the reader is owed.
  const params = auditQueryParams(
    { ...EMPTY_AUDIT_FILTER, from: '2026-08-31', to: '2026-08-01' },
    null,
  );
  assert.equal(new Date(params.p_from ?? '').getDate(), 1);
  assert.equal(new Date(params.p_to ?? '').getDate(), 31);
  assert.ok((params.p_from ?? '') < (params.p_to ?? ''), 'the range came back inverted');
});

test('a chosen group is sent as the actions it stands for', () => {
  const params = auditQueryParams({ ...EMPTY_AUDIT_FILTER, groups: ['people'] }, null);
  assert.deepEqual(params.p_actions, [
    'enrollment.added',
    'enrollment.removed',
    'enrollment.role_changed',
  ]);
});

test('two chosen groups narrow to both, not to the last one pressed', () => {
  const params = auditQueryParams({ ...EMPTY_AUDIT_FILTER, groups: ['charts', 'access'] }, null);
  assert.deepEqual(params.p_actions, [
    'chart.published',
    'mission.edited',
    'instructor.verified',
    'instructor.revoked',
    'administrator.granted',
    'administrator.revoked',
  ]);
});

test('no chosen group asks for every action', () => {
  // Null, never the full list. A list would be this build's idea of every
  // action, and a newer migration's would silently fall outside it.
  assert.equal(auditQueryParams({ ...EMPTY_AUDIT_FILTER, groups: [] }, null).p_actions, null);
});

test('a cursor asks only for what comes after the row it names', () => {
  // Both columns. Two rows written in one transaction share a `now()`, so a
  // cursor on the timestamp alone would step over whichever came second.
  const params = auditQueryParams(
    EMPTY_AUDIT_FILTER,
    { at: '2026-08-30T09:15:00.000Z', id: '4821' },
  );
  assert.equal(params.p_before_at, '2026-08-30T09:15:00.000Z');
  assert.equal(params.p_before_id, '4821');
});

// ------------------------------------------------------------- the filter bar

test('an untouched filter is not active and describes nothing', () => {
  assert.equal(auditFilterActive(EMPTY_AUDIT_FILTER), false);
  // Null, not "Showing everything" — a panel head that describes the absence of
  // a filter is noise in front of the record.
  assert.equal(describeAuditFilter(EMPTY_AUDIT_FILTER, null), null);
});

test('a filter says in one sentence what it is narrowing to', () => {
  const filter = {
    ...EMPTY_AUDIT_FILTER,
    groups: ['people' as const],
    search: 'Reyes',
    from: '2026-08-01',
    to: '2026-08-31',
  };
  assert.equal(auditFilterActive(filter), true);
  assert.equal(
    describeAuditFilter(filter, null),
    'Showing people, matching “Reyes”, from 2026-08-01 to 2026-08-31.',
  );
});

test('a filter naming a person uses their name, never their id', () => {
  const filter = {
    ...EMPTY_AUDIT_FILTER,
    actorId: '9f2c1a44-0b7e-4f3a-9d12-7c5a8e6b0f31',
    subjectUserId: '3b8d5e21-6c40-4a7f-8e19-2d0f4b7a9c63',
    subjectLabel: 'A. Reyes',
  };
  const said = describeAuditFilter(filter, 'M. Okafor') ?? '';

  assert.equal(said, 'Showing everything, by M. Okafor, about A. Reyes.');
  assert.doesNotMatch(said, /9f2c1a44|3b8d5e21/, 'a uuid reached the panel head');
});

test('a filter naming an account nobody can name still says one account', () => {
  // The actor list has not loaded, or the account was erased. "by one account"
  // is thin but true; a uuid would be worse and a blank would hide the filter.
  const said = describeAuditFilter(
    { ...EMPTY_AUDIT_FILTER, actorId: '9f2c1a44-0b7e-4f3a-9d12-7c5a8e6b0f31' },
    null,
  );
  assert.equal(said, 'Showing everything, by one account.');
});

test('clearing every control returns the untouched filter', () => {
  // Clear filters sets this object, so it has to be empty in every field. An id
  // left behind in it would keep narrowing the record with nothing on screen
  // saying so.
  assert.deepEqual(EMPTY_AUDIT_FILTER, {
    actorId: null,
    groups: [],
    from: null,
    to: null,
    search: '',
    subjectUserId: null,
    subjectCourseId: null,
    subjectLabel: null,
  });
  assert.equal(auditFilterActive(EMPTY_AUDIT_FILTER), false);
});

// ------------------------------------------------------------------- paging

const row = (id: string, at: string): AuditEntry => ({
  id,
  at,
  actorId: null,
  actorName: 'A. Admin',
  actorRole: 'administrator',
  action: 'course.published',
  subjectUserId: null,
  subjectName: null,
  subjectCourseId: null,
  courseTitle: 'Statistics 101',
  detail: {},
});

test('a full page offers a cursor to continue from', () => {
  const page = [row('9', '2026-08-30T12:00:00.000Z'), row('8', '2026-08-30T11:00:00.000Z')];
  // The oldest row on the page, because the next page starts below it.
  assert.deepEqual(nextAuditCursor(page, 2), { at: '2026-08-30T11:00:00.000Z', id: '8' });
});

test('a short page is the end of the record and offers no cursor', () => {
  const page = [row('9', '2026-08-30T12:00:00.000Z'), row('8', '2026-08-30T11:00:00.000Z')];
  assert.equal(nextAuditCursor(page, 3), null);
});

test('an empty page is the end of the record', () => {
  assert.equal(nextAuditCursor([], 100), null);
});

test('an appended page keeps the newest-first order', () => {
  const loaded = [row('9', '2026-08-30T12:00:00.000Z'), row('8', '2026-08-30T11:00:00.000Z')];
  const page = [row('7', '2026-08-30T10:00:00.000Z'), row('6', '2026-08-30T09:00:00.000Z')];
  assert.deepEqual(appendAuditPage(loaded, page).map((e) => e.id), ['9', '8', '7', '6']);
});

test('a row that arrives in two pages is kept once', () => {
  const loaded = [row('9', '2026-08-30T12:00:00.000Z'), row('8', '2026-08-30T11:00:00.000Z')];
  const page = [row('8', '2026-08-30T11:00:00.000Z'), row('7', '2026-08-30T10:00:00.000Z')];
  assert.deepEqual(appendAuditPage(loaded, page).map((e) => e.id), ['9', '8', '7']);
});

test('changing a filter starts the record again rather than appending to it', () => {
  // The screen answers a new question by appending the first page to nothing.
  // Appending it to the old answer would mix two records into one list.
  const stale = [row('9', '2026-08-30T12:00:00.000Z')];
  const fresh = [row('4', '2026-08-29T12:00:00.000Z')];
  assert.deepEqual(appendAuditPage([], fresh).map((e) => e.id), ['4']);
  assert.deepEqual(appendAuditPage(stale, fresh).map((e) => e.id), ['9', '4']);
});

// --------------------------------------------------------------- the export

const EXPORTED_AT = new Date('2026-08-30T09:15:00.000Z');

/** The records, with the four provenance lines and the blank one taken off. */
const csvRows = (csv: string) => csv.split('\r\n').slice(6);

test('the header names every column the table shows', () => {
  assert.equal(
    csvRows(auditCsv([], null, EXPORTED_AT))[0],
    'When,Who,Acting as,What they did,Person,Course,Action,Detail',
  );
});

test('an empty view exports its header and nothing else', () => {
  // No trailing break either. A blank final record is a row of empty cells in
  // most spreadsheets, and this one would read as an action nobody took.
  assert.deepEqual(csvRows(auditCsv([], null, EXPORTED_AT)), [
    'When,Who,Acting as,What they did,Person,Course,Action,Detail',
  ]);
});

test('a course title with a comma survives the round trip', () => {
  const csv = auditCsv(
    [{ ...row('1', '2026-08-30T12:00:00.000Z'), courseTitle: 'Stats, Applied' }],
    null,
    EXPORTED_AT,
  );
  assert.match(csv, /"Stats, Applied"/);
  assert.equal(csvRows(csv).length, 2);
});

test('a course title with a quote is escaped, not truncated', () => {
  const csv = auditCsv(
    [{ ...row('1', '2026-08-30T12:00:00.000Z'), courseTitle: 'The "Hard" One' }],
    null,
    EXPORTED_AT,
  );
  assert.match(csv, /"The ""Hard"" One"/);
});

test('a detail with a newline in it does not split the row', () => {
  const csv = auditCsv(
    [{
      ...row('1', '2026-08-30T12:00:00.000Z'),
      action: 'course.renamed',
      courseTitle: 'Stats',
      detail: { was: 'Statistics\n101' },
    }],
    null,
    EXPORTED_AT,
  );
  // One header, one record. A bare line break inside an unquoted field would
  // make this three.
  assert.equal(csvRows(csv).length, 2);
  assert.match(csv, /"Renamed Stats, which was Statistics\n101"/);
});

test('a timestamp is written so a spreadsheet can sort it', () => {
  const csv = auditCsv([row('1', '2026-08-30T12:00:00.000Z')], null, EXPORTED_AT);
  assert.equal(csvRows(csv)[1]?.split(',')[0], '2026-08-30T12:00:00.000Z');
});

test('a missing name is written as an empty cell, not as “null”', () => {
  const csv = auditCsv(
    [{ ...row('1', '2026-08-30T12:00:00.000Z'), subjectName: null }],
    null,
    EXPORTED_AT,
  );
  assert.equal(csvRows(csv)[1]?.split(',')[4], '');
  assert.doesNotMatch(csv, /null/);
});

test('the filename names the day it was exported', () => {
  assert.equal(
    auditCsvFilename(EMPTY_AUDIT_FILTER, new Date('2026-08-30T22:15:00.000Z')),
    'cardinal-audit-2026-08-30.csv',
  );
});

test('the filename says it is filtered when it is', () => {
  assert.equal(
    auditCsvFilename(
      { ...EMPTY_AUDIT_FILTER, groups: ['people'] },
      new Date('2026-08-30T22:15:00.000Z'),
    ),
    'cardinal-audit-2026-08-30-filtered.csv',
  );
});

// ------------------------------------------------------- filtering by subject

test('a subject filter is sent as the id, and shown as the name', () => {
  const filter = {
    ...EMPTY_AUDIT_FILTER,
    subjectCourseId: '7c1e9b30-2a48-4f6d-8b15-3e0c9d5a7f22',
    subjectLabel: 'Statistics 101',
  };
  const params = auditQueryParams(filter, null);

  assert.equal(params.p_subject_course, '7c1e9b30-2a48-4f6d-8b15-3e0c9d5a7f22');
  assert.equal(params.p_subject_user, null);
  assert.equal(describeAuditFilter(filter, null), 'Showing everything, about Statistics 101.');
});

test('a subject filter and a group filter narrow together, not instead of each other', () => {
  const params = auditQueryParams(
    {
      ...EMPTY_AUDIT_FILTER,
      subjectCourseId: '7c1e9b30-2a48-4f6d-8b15-3e0c9d5a7f22',
      groups: ['people'],
    },
    null,
  );
  assert.equal(params.p_subject_course, '7c1e9b30-2a48-4f6d-8b15-3e0c9d5a7f22');
  assert.deepEqual(params.p_actions, [
    'enrollment.added',
    'enrollment.removed',
    'enrollment.role_changed',
  ]);
});

// ------------------------------------------------------------ recent activity

const did = (action: string, at: string): AuditEntry => ({
  ...row(`${action}-${at}`, at),
  action,
});

test('the summary counts each action once', () => {
  const week = new Date('2026-08-23T00:00:00.000Z');
  const lines = auditSummary(
    [
      did('enrollment.added', '2026-08-30T10:00:00.000Z'),
      did('enrollment.removed', '2026-08-29T10:00:00.000Z'),
      did('course.published', '2026-08-28T10:00:00.000Z'),
    ],
    week,
  );
  assert.deepEqual(lines, [
    { group: 'people', label: 'People', count: 2 },
    { group: 'courses', label: 'Courses', count: 1 },
  ]);
});

test('the summary ignores anything older than the window', () => {
  const week = new Date('2026-08-23T00:00:00.000Z');
  const lines = auditSummary(
    [
      did('enrollment.added', '2026-08-30T10:00:00.000Z'),
      did('enrollment.added', '2026-08-22T23:59:59.000Z'),
      did('enrollment.added', '2026-01-04T10:00:00.000Z'),
    ],
    week,
  );
  assert.deepEqual(lines, [{ group: 'people', label: 'People', count: 1 }]);
});

test('the summary is ordered by what happened most', () => {
  const week = new Date('2026-08-23T00:00:00.000Z');
  const lines = auditSummary(
    [
      did('course.published', '2026-08-30T10:00:00.000Z'),
      did('administrator.granted', '2026-08-30T10:00:00.000Z'),
      did('administrator.revoked', '2026-08-30T10:00:00.000Z'),
      did('administrator.granted', '2026-08-29T10:00:00.000Z'),
      did('chart.published', '2026-08-28T10:00:00.000Z'),
      did('chart.published', '2026-08-27T10:00:00.000Z'),
    ],
    week,
  );
  assert.deepEqual(lines.map((line) => line.group), ['access', 'charts', 'courses']);
  assert.deepEqual(lines.map((line) => line.count), [3, 2, 1]);
});

test('a quiet week summarises as nothing rather than as a row of zeroes', () => {
  const week = new Date('2026-08-23T00:00:00.000Z');
  assert.deepEqual(auditSummary([], week), []);
  assert.deepEqual(auditSummary([did('course.published', '2026-01-04T10:00:00.000Z')], week), []);
});

test('putting somebody on a course as an instructor does not read like adding a student', () => {
  // An enrolment with role 'instructor' opens every student's grades and pace on
  // that course through `course_student_progress`. It is the most
  // privilege-sensitive row this log can hold and it must not scan as routine.
  assert.equal(
    describeAuditAction(entry({
      action: 'enrollment.added',
      subjectName: 'A. Reyes',
      detail: { role: 'instructor' },
    })),
    'Added A. Reyes to Statistics 101 as an instructor',
  );
  assert.equal(
    describeAuditAction(entry({
      action: 'enrollment.added',
      subjectName: 'A. Reyes',
      detail: { role: 'student' },
    })),
    'Added A. Reyes to Statistics 101',
  );
});

test('half a typed date is no bound at all, rather than a broken query', () => {
  // Every intermediate state of typing "2026-09-01", plus the three shapes a
  // human actually writes. `p_from` is a timestamptz on the server, so each of
  // these used to reach Postgres as "2026-0T00:00:00.000Z" and replace the
  // whole table with an error notice while the reader was still typing.
  const halves = ['2', '20', '2026', '2026-', '2026-0', '2026-09-', '1 Sept', '09/01/2026', ''];
  for (const half of halves) {
    const params = auditQueryParams({ ...EMPTY_AUDIT_FILTER, from: half }, null);
    assert.equal(params.p_from, null, `"${half}" should be no bound`);
  }
  // And the complete one still works.
  assert.ok(auditQueryParams({ ...EMPTY_AUDIT_FILTER, from: '2026-09-01' }, null).p_from);
});

test('a date that is not a real day is refused, not silently rolled over', () => {
  // `new Date(2026, 1, 31)` is 3 March. A filter that quietly moved the reader's
  // boundary two days is worse than one that ignores it.
  for (const wrong of ['2026-02-31', '2026-13-01', '2026-00-10', '2026-09-32']) {
    assert.equal(
      auditQueryParams({ ...EMPTY_AUDIT_FILTER, to: wrong }, null).p_to,
      null,
      `"${wrong}" is not a day`,
    );
  }
});

test('an export that is only part of the record says so', () => {
  // An administrator exported 100 rows of 149 under a header reading "Showing
  // everything". That file goes to legal, who have no way to know it is a page.
  // A partial record presented as a whole one is the single worst thing this
  // export could do, so it is stated on its own line rather than folded into a
  // sentence someone might skim.
  const csv = auditCsv(
    [row('1', '2026-08-30T12:00:00.000Z')],
    'Showing everything, about Statistics 101.',
    new Date('2026-08-30T09:15:00.000Z'),
    true,
  );
  const lines = csv.split('\r\n');

  assert.equal(lines[3], 'Rows,1');
  assert.match(lines[4] ?? '', /^Complete,/);
  assert.match(lines[4] ?? '', /more rows/i);
});

test('an export holding the whole of what was asked for says that instead', () => {
  const csv = auditCsv(
    [row('1', '2026-08-30T12:00:00.000Z')],
    'Showing everything, about Statistics 101.',
    new Date('2026-08-30T09:15:00.000Z'),
    false,
  );
  const lines = csv.split('\r\n');

  assert.match(lines[4] ?? '', /^Complete,/);
  assert.doesNotMatch(lines[4] ?? '', /more rows/i);
});

test('the export says what it is, when it was taken and what produced it', () => {
  // Legal opens this file a year later with no screen beside it and no filename
  // left — the recipient renamed the attachment. The file has to introduce
  // itself, and the sentence it carries is the same one the panel head showed.
  const csv = auditCsv(
    [row('1', '2026-08-30T12:00:00.000Z')],
    'Showing people, by M. Okafor.',
    new Date('2026-08-30T09:15:00.000Z'),
  );
  const lines = csv.split('\r\n');

  assert.equal(lines[0], 'Cardinal Skill audit record');
  assert.equal(lines[1], 'Exported,2026-08-30T09:15:00.000Z');
  assert.equal(lines[2], 'Covers,"Showing people, by M. Okafor."');
  assert.equal(lines[3], 'Rows,1');
  assert.equal(lines[5], '');
  assert.equal(lines[6], 'When,Who,Acting as,What they did,Person,Course,Action,Detail');
});

test('an unfiltered export names the absence of a filter', () => {
  // Completeness used to be hedged inside this sentence, which meant a filtered
  // export — the one an administrator actually sends to legal — carried no
  // hedge at all. It has its own line now, and this one only has to say that
  // nothing was narrowed.
  const csv = auditCsv([], null, new Date('2026-08-30T09:15:00.000Z'));
  assert.match(csv.split('\r\n')[2] ?? '', /no filter/i);
});

test('a name that begins like a formula is not handed to the spreadsheet as one', () => {
  // Display names and course titles are chosen by people, and this file is
  // destined for somebody else's Excel. A cell opening with = + - or @ is
  // executed there. The text must survive for the reader without being live.
  for (const hostile of [
    '=HYPERLINK("http://x.example/","click")',
    '+1+1',
    '-2+3',
    '@SUM(A1:A9)',
  ]) {
    const csv = auditCsv(
      [{ ...row('1', '2026-08-30T12:00:00.000Z'), actorName: hostile }],
      null,
      EXPORTED_AT,
    );
    const cell = csvRows(csv)[1]?.slice('2026-08-30T12:00:00.000Z,'.length) ?? '';
    assert.doesNotMatch(cell, /^"?[=+\-@]/, `${hostile} reached the file live`);
  }
});
