/**
 * The admin area's door: the password that reveals it, and the session flag
 * that remembers it was opened.
 *
 * Pure on purpose — no React, no network, no storage — so the check that
 * matters has a `node --test` check sitting next to it.
 */

/**
 * Type-only, so `node --test` strips it and this module stays reachable from a
 * test with no bundler resolving `@/`.
 */
import type {
  CourseKind,
  CoursePublicationStatus,
} from '@/features/skilltree/courseDistribution';

/**
 * THE PASSWORD IS NOT SECURITY. IT IS A UI REVEAL AND NOTHING ELSE.
 *
 * Every string in this file is compiled into the app bundle and shipped to the
 * device. Anyone who installs Cardinal Skill can read this value out of the
 * JavaScript, and a modified client can skip the check entirely. So it decides
 * what is SHOWN. It must never be the thing that AUTHORISES an administrative
 * action — same rule as the anon key in `AGENTS.md`: what is in the bundle is
 * public, and the server is the boundary.
 *
 * Real authority lives in the `administrators` table added by
 * `supabase/migrations/0028_administrators_and_open_verification.sql`. Every
 * admin RPC — `admin_set_administrator`, `admin_set_course_publication`,
 * `admin_set_enrollment`, `admin_set_instructor_verification` — re-checks
 * `is_administrator()` in its own body, and RLS checks it again on the tables
 * behind them. When the real powers are wired up, they call those RPCs and each
 * one refuses an account that is not on that table, whatever this gate showed.
 * This gate stays decoration in front of a server check; it never replaces one.
 *
 * To change the password, change it here. This is the only place it appears.
 */
export const ADMIN_PASSWORD = '123456';

/**
 * What an administrator will be able to do, in the plain words the section uses.
 * None of it is wired up yet, and the section says so rather than showing dead
 * buttons.
 */
export const ADMIN_POWERS = [
  'Edit and publish any course, not only the ones they made themselves.',
  'Archive a course, which takes it out of the catalog and keeps every student record.',
  'Give an instructor their verified badge, and take it away again.',
  'Add a student to a course, and remove one.',
  'Read the progress of a named student on any course.',
] as const;

/** Trimmed, because a keyboard that adds a trailing space is not a wrong password. */
export function adminPasswordMatches(input: string): boolean {
  return input.trim() === ADMIN_PASSWORD;
}

/**
 * Unlocked-ness for as long as the app is loaded, and no longer.
 *
 * A module variable dies with the bundle, so a reload re-locks the area. That is
 * the whole requirement: it must survive walking to another section of the
 * workspace and back, and it must not survive a reload — which rules out
 * AsyncStorage, SecureStore and every other place a value could be written.
 */
let unlocked = false;

export function adminUnlocked(): boolean {
  return unlocked;
}

/** Returns whether the area is open after this attempt. */
export function unlockAdmin(input: string): boolean {
  if (adminPasswordMatches(input)) unlocked = true;
  return unlocked;
}

export function lockAdmin(): void {
  unlocked = false;
}

// --------------------------------------------------- publication transitions

/**
 * What `admin_set_course_publication` will accept for a course, decided here so
 * the screen disables the action instead of showing the exception it raises.
 */
export interface AdminCourseAction {
  status: CoursePublicationStatus;
  label: string;
  hint: string;
}

export interface AdminCoursePublication {
  /** Empty when nothing may be done; `blocked` then says why, in a sentence. */
  actions: AdminCourseAction[];
  blocked: string | null;
}

export function adminCourseActions(course: {
  kind: CourseKind;
  publicationStatus: CoursePublicationStatus;
}): AdminCoursePublication {
  if (course.kind === 'practice') {
    return {
      actions: [],
      blocked: 'A practice course is private to its owner and has nothing to publish.',
    };
  }
  return {
    actions: TRANSITIONS.filter((action) => action.status !== course.publicationStatus),
    blocked: null,
  };
}

/**
 * One entry per status, minus whichever the course is already in. Written out
 * rather than derived from COURSE_PUBLICATION_STATUSES because the sentences
 * are the point: an administrator acting on someone else's course has to be
 * told what it does to the people on it before they press it.
 */
const TRANSITIONS: AdminCourseAction[] = [
  {
    status: 'published',
    label: 'Publish',
    hint: 'Puts it back in the catalog where students can find and join it.',
  },
  {
    status: 'draft',
    label: 'Unpublish',
    hint: 'Takes it out of the catalog and hands it back to its owner as a draft. Its share link stops working.',
  },
  {
    status: 'archived',
    label: 'Archive',
    hint: 'Takes it out of the catalog and keeps every student record on it. Nothing is deleted.',
  },
];

// ------------------------------------------------------------ error messages

/**
 * What went wrong, in words an administrator can act on.
 *
 * Same distinction `publishChart.ts` draws and for the same reason: a missing
 * function is a deployment gap and a refusal is an answer, and they must not
 * read alike. The difference here is that an admin action has no undo baseline
 * to protect, so this returns the sentence rather than throwing — the screen
 * shows it in a Notice beside the button that failed.
 *
 * Anything unrecognised is passed through untouched. A sentence invented over
 * an error nobody planned for is worse than the raw one, because it reads as
 * though the cause were understood.
 */
const NOT_APPLIED =
  'This needs migration 0028, which has not been applied to this project yet. '
  + 'Nothing was changed — it is a setup step, not a problem with the course.';

/** Function absent from the schema cache, function absent, table absent. */
const MISSING = ['PGRST202', '42883', '42P01', 'PGRST205'];

export function adminActionMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : null;
  // `'message' in error` walks the prototype chain, so an Error instance is
  // covered here too and needs no branch of its own.
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message ?? '')
    : '';

  if (code && MISSING.includes(code)) return NOT_APPLIED;
  if (code === '42501') {
    return message || 'Only an administrator can do that, and this account is not one.';
  }
  return message || 'That did not go through, and the server did not say why. Try it again.';
}

// -------------------------------------------------------- workspace scoping

/**
 * Which courses belong in an authoring workspace, and which of them may be
 * authored.
 *
 * NOT A SECURITY CONTROL, and it must never be mistaken for one. RLS decides
 * what the database hands back: 0001's `read enrolled courses` returns a course
 * to its owner and to anyone enrolled on it, and 0028 adds every course for an
 * administrator. This narrows what is *shown* on one screen, which is a
 * different question with a different answer — an instructor enrolled on
 * somebody else's course is a learner there, and a list that mixed the two
 * would offer to edit a chart the server will refuse to save.
 *
 * The administrator is the exception the product asks for: they see the site
 * and can act on it, because when something is wrong with a course whose owner
 * is unreachable, somebody has to be able to open it.
 */
export function authorableCourses<T extends { ownerId: string | null }>(
  courses: readonly T[],
  userId: string | null,
  isAdmin: boolean,
): (T & { canEdit: boolean })[] {
  if (isAdmin) return courses.map((course) => ({ ...course, canEdit: true }));
  // No account authors nothing. A demo session has no owner id, and treating a
  // missing one as a match would hand it every course whose owner is also null.
  if (!userId) return [];
  return courses
    .filter((course) => course.ownerId === userId)
    .map((course) => ({ ...course, canEdit: true }));
}

/**
 * Who is left to put on a course.
 *
 * The account directory minus the people already enrolled. It exists because
 * `course_roster` (0030) cannot answer this: that function returns the enrolled
 * students when anyone is enrolled, and every registered learner only when
 * nobody is — so the moment one student joins, everybody else vanishes from it
 * and there is no one left to look up and add. The directory therefore comes
 * from `profiles`, and this is what narrows it.
 *
 * Enrolment is `enrolled === true`, never the presence of a roster row. A row
 * with `enrolled: false` is 0030 saying "this account exists", which is a
 * different statement from "this account is on your course" — conflating them
 * is what would hide the very people this panel is for.
 */
export function addableAccounts<T extends { userId: string }>(
  accounts: readonly T[],
  roster: readonly { userId: string; enrolled: boolean }[],
): T[] {
  const on = new Set(roster.filter((row) => row.enrolled).map((row) => row.userId));
  return accounts.filter((account) => !on.has(account.userId));
}
