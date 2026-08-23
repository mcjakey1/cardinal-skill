import { supabase } from '@/lib/supabase';
import { cacheCourseList, loadCachedCourseOptions, updateCachedCourse } from '@/lib/courseCache';
import { DEMO_COURSE_ID, DEMO_COURSE_TITLE } from './demoTree';
import { MOCK_COURSES } from './mockCourses';

export interface CourseOption {
  id: string;
  courseCode: string | null;
  title: string;
  term: string | null;
  canEdit: boolean;
  canDelete: boolean;
  canRemove: boolean;
}

export interface CourseMetadata {
  courseCode: string;
  title: string;
  term: string;
}

/** Courses visible to the caller. Supabase RLS owns the enrolment boundary. */
export async function fetchCourseOptions(): Promise<CourseOption[]> {
  const [{ data, error }, { data: auth }] = await Promise.all([
    supabase.from('courses').select('id, course_code, title, term, owner_id').order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  const fixtures: CourseOption[] = [
    { id: DEMO_COURSE_ID, courseCode: null, title: DEMO_COURSE_TITLE, term: 'Example chart', canEdit: false, canDelete: false, canRemove: false },
    ...MOCK_COURSES.map(({ id, title, term }) => ({ id, courseCode: null, title, term, canEdit: false, canDelete: false, canRemove: false })),
  ];
  if (error) {
    return auth.user
      ? [...await loadCachedCourseOptions(), ...fixtures]
      : fixtures;
  }

  const liveCourses: CourseOption[] = (data ?? []).map(({ id, course_code, title, term, owner_id }) => ({
      id, courseCode: course_code, title, term,
      canEdit: owner_id === auth.user?.id,
      canDelete: owner_id === auth.user?.id,
      canRemove: Boolean(auth.user?.id) && owner_id !== auth.user?.id,
    }));
  await cacheCourseList(liveCourses).catch(() => {});
  return [...liveCourses, ...fixtures];
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
