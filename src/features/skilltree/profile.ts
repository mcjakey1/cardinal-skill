/**
 * What makes a student profile usable, said once.
 *
 * The rules are deliberately few. Three fields are required because the product
 * cannot address a student without them; everything else is optional, because a
 * required field a student does not want to answer is a form they abandon
 * rather than a form they complete honestly.
 *
 * Pure and dependency-free, same contract as `progression.ts`.
 */

import type { StudentProfile } from './types';

/** Long enough for any real answer, short enough to render in one line. */
const MAX_FIELD = 120;

export const EMPTY_PROFILE: StudentProfile = {
  fullName: '',
  email: '',
  studentNumber: '',
  program: '',
  yearLevel: '',
  campus: '',
  studyPace: 'balanced',
};

/** Field name → what is wrong with it, written for the person fixing it. */
export type ProfileErrors = Partial<Record<keyof StudentProfile, string>>;

/**
 * Deliberately not the RFC. A full address grammar rejects things people
 * actually use and accepts things that cannot receive mail; these three checks
 * catch the mistakes a student makes typing their own address, which is the
 * whole job here. The authority on whether an address works is a mail server,
 * and it is not being asked.
 */
function emailProblem(raw: string): string | undefined {
  const value = raw.trim();
  if (/\s/.test(value)) return 'An email address cannot contain spaces.';

  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) {
    return 'That does not look like an email address. It needs one @.';
  }

  const domain = value.slice(at + 1);
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    return 'The part after the @ needs a dot, like example.edu.';
  }
  return undefined;
}

export function validateProfile(profile: StudentProfile): ProfileErrors {
  const errors: ProfileErrors = {};
  const value = (key: keyof StudentProfile) => String(profile?.[key] ?? '').trim();

  if (!value('fullName')) errors.fullName = 'Tell us what to call you.';
  if (!value('studentNumber')) errors.studentNumber = 'Your student number is required.';

  const email = value('email');
  if (!email) errors.email = 'Your email address is required.';
  else {
    const problem = emailProblem(email);
    if (problem) errors.email = problem;
  }

  // Truncating instead would change what someone typed without telling them.
  for (const key of [
    'fullName',
    'email',
    'studentNumber',
    'program',
    'yearLevel',
    'campus',
  ] as const) {
    if (!errors[key] && value(key).length > MAX_FIELD) {
      errors[key] = `Keep this under ${MAX_FIELD} characters.`;
    }
  }

  return errors;
}

/** True when the profile is good enough to save. */
export function isComplete(profile: StudentProfile): boolean {
  return Object.keys(validateProfile(profile)).length === 0;
}
