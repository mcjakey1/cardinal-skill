/**
 * What a roster is, once two reads have come back.
 *
 * The instructor screen asks the database two questions, because they have two
 * different privacy answers. `course_roster` (0029) returns who the people are —
 * name and email — behind an ownership check written into that function's own
 * body. `course_student_progress` (0005, 0027) returns how far the enrolled ones
 * have got. Joining them is arithmetic, so it lives here where `node --test` can
 * reach it rather than inside a component.
 *
 * **The distinction this module exists to keep.** Nothing in the product enrols a
 * student on an instructor's course yet, so 0029 falls back to listing registered
 * accounts and marks every such row `enrolled: false`. Those two facts must never
 * be shown as one: "on my course" and "has an account here" are different
 * statements about a person, and an instructor who confuses them will email the
 * wrong class. The mode below is what the screen labels itself with, and it is
 * derived from the data rather than assumed.
 *
 * When explicit enrolment ships, 0029 loses its fallback branch, every row comes
 * back `enrolled: true`, and `registered` simply stops occurring. Nothing here
 * needs deleting for that to be true.
 */

import { activityFlag } from './cohort.ts';

/** One person, as `course_roster` returns them. */
export interface RosterContact {
  userId: string;
  displayName: string;
  email: string;
  /** False means: has an account, is not on this course. */
  enrolled: boolean;
}

/** One enrolled student's figures, as `course_student_progress` returns them. */
export interface RosterProgress {
  userId: string;
  displayName: string;
  mastered: number;
  gradedNodes: number;
  progress: number;
  xp: number;
  lastActive: string | null;
}

/** A row of the table on screen. */
export interface RosterEntry extends RosterProgress {
  /** Null only when the database predates 0029 and cannot return addresses. */
  email: string | null;
  enrolled: boolean;
}

export type RosterMode =
  /** These people are on this course. Progress figures mean something. */
  | 'enrolled'
  /** Nobody is enrolled; these are registered accounts, standing in. */
  | 'registered'
  /** 0029 is not applied here, so no address could be read for anyone. */
  | 'no-contacts';

export interface RosterView {
  mode: RosterMode;
  rows: RosterEntry[];
}

/**
 * Merge the two reads into the list the screen draws.
 *
 * `contacts` is null when `course_roster` is missing from the database — an
 * older project that has not had 0029 applied. That is not an error: the
 * progress read still works, so the screen degrades to the roster it has always
 * shown and says why the email column is empty. Failing the whole panel over a
 * missing column would be a worse outcome than the one being fixed.
 *
 * A contact with no progress row keeps zeroes rather than being dropped. Someone
 * who is not enrolled genuinely has no progress on this course, and a roster that
 * silently omitted them would be the empty panel again.
 */
export function mergeRoster(
  contacts: RosterContact[] | null,
  progress: RosterProgress[],
): RosterView {
  if (contacts === null) {
    return {
      mode: 'no-contacts',
      rows: progress.map((row) => ({ ...row, email: null, enrolled: true })),
    };
  }

  const byUser = new Map(progress.map((row) => [row.userId, row]));
  // A course-level fact, not a student-level one, so it is the same number for
  // everyone and survives a student having no progress row at all.
  const gradedNodes = progress[0]?.gradedNodes ?? 0;

  const rows = contacts.map((contact) => {
    const figures = byUser.get(contact.userId);
    return {
      userId: contact.userId,
      displayName: contact.displayName,
      email: contact.email,
      enrolled: contact.enrolled,
      mastered: figures?.mastered ?? 0,
      gradedNodes: figures?.gradedNodes ?? gradedNodes,
      progress: figures?.progress ?? 0,
      xp: figures?.xp ?? 0,
      lastActive: figures?.lastActive ?? null,
    };
  });

  // Every row of one call shares the flag — 0029 decides once per course whether
  // it is answering with enrolment or with the fallback — so the first row
  // settles it. No rows means nobody is enrolled and nobody else has registered,
  // which is the enrolled answer to an empty course.
  const mode: RosterMode = rows.length > 0 && !rows[0]!.enrolled ? 'registered' : 'enrolled';
  return { mode, rows };
}

/**
 * Sort order, restated after the merge.
 *
 * `course_student_progress` returns least-progress-first for a reason 0005 spells
 * out: the reason to open a roster is to find who is stuck. `course_roster`
 * cannot sort on progress it does not read, so the order is re-applied here on
 * the joined rows. Name breaks the tie, so a class where nobody has started yet
 * is still alphabetical rather than arbitrary.
 */
export function sortRoster(rows: RosterEntry[]): RosterEntry[] {
  return [...rows].sort(
    (a, b) => a.progress - b.progress || a.displayName.localeCompare(b.displayName),
  );
}

/**
 * `activityFlag`, but never against somebody who was not given the course.
 *
 * "Nothing cleared yet" is a fair observation about an enrolled student and an
 * accusation against a stranger. A registered account in the fallback list was
 * never asked to clear anything, so nothing about it is worth an instructor's
 * attention yet, and the row carries no badge.
 */
export function rosterFlag(row: RosterEntry, now: Date): 'not-started' | 'stale' | null {
  if (!row.enrolled) return null;
  return activityFlag(row, now);
}

/**
 * The roster, narrowed to whoever was named.
 *
 * An administrator reads a student's progress on a course they had no part in,
 * so they arrive knowing a name and nothing else — no row to click, no class
 * they recognise. Search is how that name becomes a person.
 *
 * Blank returns everyone rather than nobody: an empty box is not a filter, and
 * a roster that vanished until something was typed would read as an empty
 * course. Order is left alone, so whatever `sortRoster` decided still holds.
 */
export function findPeople<T extends { displayName: string; email?: string | null }>(
  query: string,
  people: readonly T[],
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...people];
  return people.filter(
    (person) =>
      person.displayName.toLowerCase().includes(needle)
      || (person.email ?? '').toLowerCase().includes(needle),
  );
}
