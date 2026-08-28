/**
 * The administrator's writes, and the reads only an administrator gets.
 *
 * Every function here is a thin call onto something
 * `0028_administrators_and_open_verification.sql` already ships. None of them
 * is the access control: each RPC re-checks `is_administrator()` in its own
 * body and RLS checks it again on the tables behind them, so a client that
 * skipped this module entirely would be refused all the same. What this module
 * decides is what the screen *asks for* — never what it is allowed.
 *
 * Deliberately not in `admin.ts`: that file states at the top that it is pure
 * so a `node --test` check can sit beside it, and the decisions worth testing
 * (`adminCourseActions`, `adminActionMessage`) live there. This is the network
 * half, and it is untested for the same reason `courseQueries.ts` and
 * `publishChart.ts` are — there is nothing here but the call.
 */

import { supabase } from '@/lib/supabase';
import {
  normalizeCourseDistribution,
  type CourseDistribution,
  type CoursePublicationStatus,
} from '@/features/skilltree/courseDistribution';

/** One course as the admin course list draws it. */
export interface AdminCourse extends CourseDistribution {
  id: string;
  title: string;
  term: string | null;
  courseCode: string | null;
  ownerId: string | null;
  /** True when the signed-in administrator happens to own it too. */
  own: boolean;
}

/** One account, as `profiles` returns them to an administrator. */
export interface AdminAccount {
  userId: string;
  displayName: string;
  /** `profiles` holds no address. Named so `findPeople` searches one shape. */
  email: null;
  /** Null when this database has not had 0034's read policy applied yet. */
  verified: boolean | null;
}

/**
 * Whether the server says this account is an administrator.
 *
 * Fail-closed on a missing table: 0028 has not reached every project, and a
 * 404 there means "not an administrator", which is the safe answer, not a
 * broken screen. Shared with `fetchCourseOptions` so the workspace and this
 * page cannot disagree about who the caller is.
 */
export async function isAdministrator(): Promise<boolean> {
  const { data, error } = await supabase.from('administrators').select('user_id').maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return false;
    throw error;
  }
  return Boolean(data);
}

/**
 * Every course on the site.
 *
 * No filter and no owner column in the `where`: "administrators read any
 * course" (0028) is what widens this, and adding a client-side predicate here
 * would look like the control and isn't. A non-administrator calling this gets
 * their own courses, which is exactly what RLS says they may have.
 */
export async function fetchAllCourses(): Promise<AdminCourse[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, term, course_code, owner_id, course_kind, publication_status, discoverability, source_course_id')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const { data: auth } = await supabase.auth.getUser();
  return (data ?? []).map((row) => ({
    ...normalizeCourseDistribution(row as Record<string, unknown>),
    id: String(row.id),
    title: String(row.title),
    term: row.term ?? null,
    courseCode: row.course_code ?? null,
    ownerId: row.owner_id ?? null,
    own: Boolean(auth.user?.id) && row.owner_id === auth.user?.id,
  }));
}

/**
 * Every account, and whether each one currently holds a verified badge.
 *
 * Two reads with different histories. `profiles` opens to an administrator
 * through 0005's `owner reads enrolled student profiles`, whose
 * `teaches_student` helper 0028 widened to pass any administrator. Reading who
 * is *verified* needs 0034: 0021 gave `verified_instructors` a
 * `user_id = auth.uid()` select policy and 0028 did not widen it, so before
 * 0034 an administrator can set a badge and cannot see one.
 *
 * That gap degrades rather than fails. `verified` comes back null, and the
 * screen says the current state is unreadable instead of drawing every account
 * as unverified — which would be a lie in the one direction that matters.
 */
export async function fetchAccounts(): Promise<AdminAccount[]> {
  const [profiles, verified] = await Promise.all([
    supabase.from('profiles').select('id, display_name').order('display_name'),
    supabase.from('verified_instructors').select('user_id, revoked_at'),
  ]);
  if (profiles.error) throw profiles.error;

  // A revoked row is still a row. Verification is `revoked_at is null`, which
  // is what `is_verified_instructor` checks, and reading the row's presence
  // alone would show a revoked instructor as verified.
  const badges = verified.error
    ? null
    : new Set(
        (verified.data ?? [])
          .filter((row) => row.revoked_at === null)
          .map((row) => String(row.user_id)),
      );

  return (profiles.data ?? []).map((row) => ({
    userId: String(row.id),
    displayName: String(row.display_name || 'Unnamed account'),
    email: null,
    verified: badges === null ? null : badges.has(String(row.id)),
  }));
}

/** Publish, unpublish or archive any course. Archiving keeps every record. */
export async function setCoursePublication(
  courseId: string,
  status: CoursePublicationStatus,
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_course_publication', {
    p_course_id: courseId,
    p_status: status,
  });
  if (error) throw error;
}

/** Grant or revoke an instructor's verified badge. Revoking is durable. */
export async function setInstructorVerification(
  userId: string,
  verified: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_instructor_verification', {
    p_user_id: userId,
    p_verified: verified,
  });
  if (error) throw error;
}

/** Put someone on a course, or take them off it. Progress survives removal. */
export async function setEnrollment(
  courseId: string,
  userId: string,
  enrolled: boolean,
  role: 'student' | 'instructor' = 'student',
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_enrollment', {
    p_course_id: courseId,
    p_user_id: userId,
    p_enrolled: enrolled,
    p_role: role,
  });
  if (error) throw error;
}
