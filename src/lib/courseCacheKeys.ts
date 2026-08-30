export const COURSES_CACHE_KEY = '@cardinal_courses';
export const COURSE_ORDER_CACHE_KEY = '@cardinal_course_order_v1';
export const courseTreeCacheKey = (courseId: string) => `@cardinal_nodes_${courseId}`;

/**
 * Account data that names no course, and so cannot be caught by the family
 * pattern below. Each entry is a whole key, not a prefix.
 *
 * The test for membership is "does this describe the person or the device". A
 * profile is the student's own name and pace; the seen-course list is what that
 * student has looked at. Both belong to whoever was signed in.
 */
const ACCOUNT_KEYS = new Set(['cardinal.profile.v1', 'cardinal.seencourses.v1']);

/**
 * Whether a stored key holds one account's data, and so must not outlive a
 * sign-out.
 *
 * This was a list of four prefixes, and the list fell behind: `progress.ts`
 * added the `cardinal.<name>.v1.<courseId>` completion logs and the sign-out
 * path never learned them, so the previous account's completions stayed on the
 * device and the next sign-in uploaded them under a new `auth.uid()`. Matching
 * the family rather than naming its members is what stops that recurring — a
 * new per-course key is cleared the day it is written.
 *
 * Device settings are deliberately outside both: `cardinal.prefs.v1`,
 * `cardinal.theme-preset.v1` and `cardinal.backdrop.v1:<owner>` are how this
 * device has been set up, not who was using it, and keep their value across a
 * sign-out. `cardinal.auth-session.v1` is outside it because the sign-out path
 * removes that one by name before it gets here.
 */
/**
 * The one member of the family that stays.
 *
 * Everything else matched below is a completion log, and the harm those do is
 * specific: `progress.ts` flushes them to the server under whoever signs in
 * next. A chart draft is never uploaded as anybody — publishing it writes into
 * a course whose access the server checks for itself — so clearing it prevents
 * almost nothing and destroys every unpublished edit an author made before
 * signing out, with no warning and no way back.
 *
 * The residual: the draft stays on the device, so the next person to sign in
 * could see it — but only if they already hold authoring rights on that same
 * course, which is the only way to open the screen that reads it.
 */
const DRAFT_PREFIX = 'cardinal.chart-draft.v1.';

export function isCourseScopedCacheKey(key: string): boolean {
  if (key.startsWith(DRAFT_PREFIX)) return false;
  return (
    key.startsWith('@cardinal_') || ACCOUNT_KEYS.has(key) || /^cardinal\.[^.]+\.v1\..+/.test(key)
  );
}
