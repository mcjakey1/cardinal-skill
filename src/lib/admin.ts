/**
 * The admin area's door: the password that reveals it, and the session flag
 * that remembers it was opened.
 *
 * Pure on purpose — no React, no network, no storage — so the check that
 * matters has a `node --test` check sitting next to it.
 */

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
