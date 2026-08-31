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
import { EMPTY_AUDIT_FILTER, auditQueryParams } from '@/lib/admin';
import type {
  AccountType,
  AccountTypeAccount,
  AuditCursor,
  AuditEntry,
  AuditFilter,
} from '@/lib/admin';
import {
  normalizeCourseDistribution,
  type CourseDistribution,
  type CoursePublicationStatus,
} from '@/features/skilltree/courseDistribution';

/** The `courses` columns the admin list reads. */
type AdminCourseRow = {
  id: string;
  title: string;
  term: string | null;
  course_code: string | null;
  owner_id: string | null;
};

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
  // Paged, not a bare select: `max_rows` truncates at a thousand with nothing
  // in the response to say so, and a site past that would hide courses from the
  // one account whose job is to find them.
  const data = await readEveryRow<AdminCourseRow>(
    'courses',
    'id, title, term, course_code, owner_id, course_kind, publication_status, discoverability, source_course_id',
    'id',
    { column: 'created_at', ascending: false },
  );

  const { data: auth } = await supabase.auth.getUser();
  return data.map((row) => ({
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
  const [profiles, badges] = await Promise.all([
    readEveryRow('profiles', 'id, display_name', 'id', { column: 'display_name' }),
    // A revoked row is still a row. Verification is `revoked_at is null`, which
    // is what `is_verified_instructor` checks, and reading the row's presence
    // alone would show a revoked instructor as verified.
    readEveryRow('verified_instructors', 'user_id, revoked_at', 'user_id').then(
      (rows) =>
        new Set(
          rows.filter((row) => row.revoked_at === null).map((row) => String(row.user_id)),
        ),
      // Degrades rather than fails, exactly as before: null means the badge
      // state is unreadable on this database, not that nobody holds one.
      () => null,
    ),
  ]);

  return profiles.map((row) => ({
    userId: String(row.id),
    displayName: String(row.display_name || 'Unnamed account'),
    email: null,
    verified: badges === null ? null : badges.has(String(row.id)),
  }));
}

/** PostgREST's `max_rows`, from `supabase/config.toml`. */
const PAGE_ROWS = 1000;

/**
 * ponytail: fifty pages, so fifty thousand accounts. Past that this should be a
 * server-side name search rather than a longer loop — the picker is filtered in
 * the browser by `findPeople`, and holding an institution's whole directory in
 * memory to do that stops being reasonable somewhere around here. The cap is a
 * bound on the loop, not a considered limit.
 */
const MAX_PAGES = 50;

/**
 * Every row, rather than the first `max_rows` of them.
 *
 * A select with no range is silently truncated by PostgREST at `max_rows`, and
 * nothing in the response says it happened. On an institution with more
 * accounts than that, half the directory simply was not there — and an account
 * missing from *Filter by who did it* reads as a person who has done nothing,
 * which is the one thing this screen must never imply. Paged until a short page
 * says the table ended.
 *
 * `keyColumn` is the table's primary key and is not optional, because paging
 * with `.range()` over an unstable order drops rows all by itself: Postgres
 * gives no order across separate `offset` requests unless one is asked for, and
 * a non-unique `order by` (`display_name`) is only half an order. Either way a
 * row can land on two pages and be missing from a third — reintroducing the
 * failure this function exists to prevent. Any display order is applied first
 * and the key breaks its ties.
 */
export async function readEveryRow<T = Record<string, unknown>>(
  table: string,
  columns: string,
  keyColumn: string,
  order?: { column: string; ascending?: boolean },
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_ROWS;
    let query = supabase.from(table).select(columns).range(from, from + PAGE_ROWS - 1);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
    query = query.order(keyColumn);

    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as T[]));
    if ((data?.length ?? 0) < PAGE_ROWS) break;
  }
  return rows;
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

/** Every non-administrator account with the global type login routing uses. */
export async function fetchAccountDirectory(): Promise<AccountTypeAccount[]> {
  const { data, error } = await supabase.rpc('admin_account_directory');
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    userId: String(row.user_id),
    displayName: String(row.display_name || 'Unnamed account'),
    email: String(row.email || ''),
    accountType: row.account_type === 'instructor' ? 'instructor' : 'student',
  }));
}

/** Change a non-administrator account's authoritative global type. */
export async function setAccountType(userId: string, accountType: AccountType): Promise<void> {
  const { error } = await supabase.rpc('admin_set_account_type', {
    p_user_id: userId,
    p_account_type: accountType,
  });
  if (error) throw error;
}

/**
 * Who else holds the keys.
 *
 * Answerable only since 0042 widened the `administrators` select policy from
 * `user_id = auth.uid()` to "your own row, or every row if you are an
 * administrator". Before it, this read returned the caller and nobody else, so
 * the panel above it could not have existed. An ordinary account calling this
 * still gets its own row and nothing more — the policy is the control, not this
 * function.
 *
 * `self` is computed here the same way `fetchAllCourses` computes `own`, so the
 * screen can disable the one removal the RPC refuses (a lockout, `42501`)
 * rather than letting it be pressed and explained afterwards.
 */
export interface AdministratorRecord {
  userId: string;
  grantedAt: string;
  self: boolean;
}

export async function fetchAdministrators(): Promise<AdministratorRecord[]> {
  const rows = await readEveryRow<{ user_id: string; granted_at: string }>(
    'administrators',
    'user_id, granted_at',
    'user_id',
    { column: 'granted_at' },
  );
  const { data: auth } = await supabase.auth.getUser();
  return rows.map((row) => ({
    userId: String(row.user_id),
    grantedAt: String(row.granted_at),
    self: Boolean(auth.user?.id) && String(row.user_id) === auth.user?.id,
  }));
}

/** Make somebody an administrator, or stop them being one. */
export async function setAdministrator(userId: string, admin: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_administrator', {
    p_user_id: userId,
    p_admin: admin,
  });
  if (error) throw error;
}

/**
 * The accounts placed on this course as instructors rather than students.
 *
 * A second read because `course_roster` (0030) selects `e.role = 'student'`, so
 * a co-instructor is simply not in it — invisible on the roster, and still
 * offered on the "add someone" list after being added. The `eq` pair here is
 * the shape of the question, not a security control: 0028's "administrators
 * write any enrollment" is `for all`, so an administrator may read every
 * enrolment row and RLS is what decides that.
 */
export async function fetchCourseInstructors(courseId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('user_id')
    .eq('course_id', courseId)
    .eq('role', 'instructor');
  if (error) throw error;
  return (data ?? []).map((row) => String(row.user_id));
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


/**
 * What has been done to the site, newest first, narrowed to what was asked for.
 *
 * One RPC rather than a select plus two lookups per row: `audit_trail` (0039)
 * is `security definer` and states the administrator check in its own body, the
 * way `course_roster` does, and it returns the names already resolved. Those
 * names were written into the row when the action happened, so a row still
 * reads after the account or the course it names is gone.
 *
 * The filter travels to the server rather than being applied to what comes
 * back. A predicate here would only ever see the page already loaded, so "no
 * match" would mean "not in these hundred rows" while the screen said "not in
 * the record" — `auditQueryParams` carries the whole mapping and says why.
 *
 * There is deliberately no write here. The log is written by triggers and by
 * the functions that perform the actions, never by a client — a client that
 * logs its own behaviour can be modified not to.
 */
export async function fetchAuditTrail(
  filter: AuditFilter = EMPTY_AUDIT_FILTER,
  cursor: AuditCursor | null = null,
  limit = 100,
): Promise<AuditEntry[]> {
  const { data, error } = await supabase.rpc('audit_trail', auditQueryParams(filter, cursor, limit));
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    at: String(row.at),
    actorId: row.actor_id ? String(row.actor_id) : null,
    actorName: String(row.actor_name || 'An administrator'),
    // Narrowed rather than cast: the column is `text` with a check constraint,
    // and a value from a newer migration must not be asserted into this union.
    actorRole: row.actor_role === 'owner'
      ? 'owner'
      : row.actor_role === 'instructor'
        ? 'instructor'
        : 'administrator',
    action: String(row.action),
    subjectUserId: row.subject_user_id ? String(row.subject_user_id) : null,
    subjectName: row.subject_name ? String(row.subject_name) : null,
    subjectCourseId: row.subject_course_id ? String(row.subject_course_id) : null,
    courseTitle: row.course_title ? String(row.course_title) : null,
    detail: (row.detail as Record<string, unknown>) ?? {},
  }));
}
