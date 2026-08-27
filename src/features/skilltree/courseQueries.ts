import { supabase } from '@/lib/supabase';
import {
  cacheCourseList,
  cacheCourseOrder,
  loadCachedCourseOrder,
  loadCachedCourseOptions,
  markCourseOrderSynced,
  removeCachedCourse,
  updateCachedCourse,
} from '@/lib/courseCache';
import { purgeCourseCache } from '@/lib/editedTree';
import { clearLocal } from '@/lib/progress';
import { DEMO_COURSE_ID, DEMO_COURSE_TITLE } from './demoTree';
import { MOCK_COURSES } from './mockCourses';
import { applySavedCourseOrder } from './courseOrdering';
import {
  normalizeCourseDistribution,
  PRIVATE_PRACTICE_DISTRIBUTION,
  type CourseDistribution,
} from './courseDistribution';

export interface CourseOption extends CourseDistribution {
  id: string;
  courseCode: string | null;
  title: string;
  term: string | null;
  canEdit: boolean;
  canDelete: boolean;
  canRemove: boolean;
  isFixture: boolean;
  sortOrder: number;
}

export interface CourseMetadata {
  courseCode: string;
  title: string;
  term: string;
}

/** Courses visible to the caller. Supabase RLS owns the enrolment boundary. */
export async function fetchCourseOptions(): Promise<CourseOption[]> {
  const [{ data, error }, { data: auth }, { data: preferences }, localOrder] = await Promise.all([
    fetchCourseRows(),
    supabase.auth.getUser(),
    supabase.from('course_preferences').select('course_id, sort_order'),
    loadCachedCourseOrder(),
  ]);
  const fixtures: CourseOption[] = [
    { id: DEMO_COURSE_ID, courseCode: null, title: DEMO_COURSE_TITLE, term: 'Example chart', ...PRIVATE_PRACTICE_DISTRIBUTION, canEdit: false, canDelete: false, canRemove: false, isFixture: true, sortOrder: 10_000 },
    ...MOCK_COURSES.map(({ id, title, term }, index) => ({ id, courseCode: null, title, term, ...PRIVATE_PRACTICE_DISTRIBUTION, canEdit: false, canDelete: false, canRemove: false, isFixture: true, sortOrder: 10_001 + index })),
  ];
  if (error) {
    return auth.user
      ? [...await loadCachedCourseOptions(), ...fixtures]
      : fixtures;
  }

  const orderByCourse = new Map((preferences ?? []).map((row) => [row.course_id, row.sort_order]));
  const liveCourses = applySavedCourseOrder((data ?? []).map((row, index) => ({
      ...normalizeCourseDistribution(row as {
        course_kind?: unknown;
        publication_status?: unknown;
        discoverability?: unknown;
        source_course_id?: unknown;
      }),
      id: row.id, courseCode: row.course_code, title: row.title, term: row.term,
      canEdit: row.owner_id === auth.user?.id,
      canDelete: row.owner_id === auth.user?.id,
      canRemove: Boolean(auth.user?.id) && row.owner_id !== auth.user?.id,
      isFixture: false,
      sortOrder: orderByCourse.get(row.id) ?? 1_000 + index,
    })), localOrder.ids);
  await cacheCourseList(liveCourses).catch(() => {});
  if (localOrder.pendingSync && auth.user) {
    void syncRemoteCourseOrder(liveCourses, auth.user.id)
      .then(() => markCourseOrderSynced(liveCourses.map((course) => course.id)))
      .catch(() => {});
  }
  return [...liveCourses, ...fixtures];
}

async function fetchCourseRows() {
  const current = await supabase
    .from('courses')
    .select('id, course_code, title, term, owner_id, created_at, course_kind, publication_status, discoverability, source_course_id')
    .order('created_at', { ascending: false });
  if (!current.error) return current;
  if (current.error.code !== '42703' && current.error.code !== 'PGRST204') return current;

  // The app and migration can roll out independently. Legacy rows normalize to
  // private practice without broadening the selected course metadata.
  return supabase
    .from('courses')
    .select('id, course_code, title, term, owner_id, created_at')
    .order('created_at', { ascending: false });
}

export async function updateCourseMetadata(courseId: string, metadata: CourseMetadata): Promise<void> {
  const { error } = await supabase
    .from('courses')
    .update({
      course_code: metadata.courseCode || null,
      title: metadata.title,
      term: metadata.term || null,
    })
    .eq('id', courseId);
  if (error) throw error;
  await updateCachedCourse(courseId, metadata).catch(() => {});
}

/** The device save is authoritative; cloud sync is opportunistic and retryable. */
export async function persistCourseOrder(courses: readonly CourseOption[]): Promise<boolean> {
  const liveCourses = courses
    .filter((course) => !course.isFixture)
    .map((course, index) => ({ ...course, sortOrder: index }));
  const ids = liveCourses.map((course) => course.id);
  await Promise.all([
    cacheCourseList(liveCourses),
    cacheCourseOrder(ids, true),
  ]);

  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return false;
    await syncRemoteCourseOrder(liveCourses, auth.user.id);
    await markCourseOrderSynced(ids);
    return true;
  } catch {
    return false;
  }
}

async function syncRemoteCourseOrder(
  courses: readonly CourseOption[],
  userId: string,
): Promise<void> {
  if (courses.length === 0) return;
  const { error } = await supabase.from('course_preferences').upsert(
    courses.map((course, index) => ({
      user_id: userId,
      course_id: course.id,
      sort_order: index,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'user_id,course_id' },
  );
  if (error) throw error;
}

export async function resetCourseProgress(courseId: string): Promise<void> {
  const { error } = await supabase.rpc('reset_own_course_progress', { p_course_id: courseId });
  if (error) throw error;
  await clearLocal(courseId);
}

export async function duplicateCourse(courseId: string): Promise<string> {
  let result = await supabase.rpc('fork_course_as_practice', { p_course_id: courseId });
  // During the staged rollout, older databases do not have the wrapper yet.
  // The established fork still creates a private owner-only copy.
  if (result.error?.code === 'PGRST202' || result.error?.code === '42883') {
    result = await supabase.rpc('fork_course', { p_course_id: courseId });
  }
  const { data, error } = result;
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('The duplicated chart did not return a course id.');
  return data;
}

export async function deleteCourse(courseId: string): Promise<void> {
  const { error } = await supabase.from('courses').delete().eq('id', courseId);
  if (error) throw error;
  await Promise.all([
    purgeCourseCache(courseId),
    removeCachedCourse(courseId),
    clearLocal(courseId),
  ]);
}
