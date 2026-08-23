import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CourseMetadata, CourseOption } from '@/features/skilltree/courseQueries';
import type { TreeSnapshot } from '@/features/skilltree/queries';
import { COURSES_CACHE_KEY, courseTreeCacheKey } from './courseCacheKeys';

export { COURSES_CACHE_KEY, courseTreeCacheKey } from './courseCacheKeys';

type CachedCourse = CourseOption;

interface CachedTreeEnvelope {
  version: 1;
  snapshot: TreeSnapshot;
}

async function readCourses(): Promise<CachedCourse[]> {
  try {
    const raw = await AsyncStorage.getItem(COURSES_CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((course): course is CachedCourse => (
          typeof course === 'object' && course !== null
          && typeof (course as CachedCourse).id === 'string'
          && typeof (course as CachedCourse).title === 'string'
          && typeof (course as CachedCourse).canEdit === 'boolean'
          && typeof (course as CachedCourse).canDelete === 'boolean'
        ))
      : [];
  } catch {
    return [];
  }
}

export async function loadCachedCourseOptions(): Promise<CourseOption[]> {
  return readCourses();
}

export async function cacheCourseList(courses: readonly CourseOption[]): Promise<void> {
  await AsyncStorage.setItem(COURSES_CACHE_KEY, JSON.stringify(courses));
}

export async function cacheParsedCourse(
  course: Pick<CachedCourse, 'id' | 'courseCode' | 'title' | 'term'>,
  snapshot: TreeSnapshot,
): Promise<void> {
  const courses = await readCourses();
  const next: CachedCourse[] = [
    { ...course, canEdit: true, canDelete: true, canRemove: false },
    ...courses.filter((item) => item.id !== course.id),
  ];
  await AsyncStorage.multiSet([
    [COURSES_CACHE_KEY, JSON.stringify(next)],
    [courseTreeCacheKey(course.id), JSON.stringify({ version: 1, snapshot } satisfies CachedTreeEnvelope)],
  ]);
}

export async function updateCachedCourse(courseId: string, metadata: CourseMetadata): Promise<void> {
  const courses = await readCourses();
  await AsyncStorage.setItem(COURSES_CACHE_KEY, JSON.stringify(courses.map((course) => (
    course.id === courseId
      ? { ...course, courseCode: metadata.courseCode || null, title: metadata.title, term: metadata.term || null }
      : course
  ))));
  const snapshot = await loadCachedTree(courseId);
  if (snapshot) {
    await AsyncStorage.setItem(courseTreeCacheKey(courseId), JSON.stringify({
      version: 1,
      snapshot: { ...snapshot, title: metadata.title },
    } satisfies CachedTreeEnvelope));
  }
}

export async function loadCachedTree(courseId: string): Promise<TreeSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(courseTreeCacheKey(courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedTreeEnvelope>;
    const snapshot = parsed.version === 1 ? parsed.snapshot : null;
    return snapshot && Array.isArray(snapshot.tree?.nodes) && Array.isArray(snapshot.tree?.prereqs)
      ? snapshot
      : null;
  } catch {
    return null;
  }
}

export async function removeCachedCourse(courseId: string): Promise<void> {
  const courses = await readCourses();
  await AsyncStorage.setItem(
    COURSES_CACHE_KEY,
    JSON.stringify(courses.filter((course) => course.id !== courseId)),
  );
  await AsyncStorage.removeItem(courseTreeCacheKey(courseId));
}

export async function clearCourseCaches(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const courseKeys = keys.filter((key) => (
    key === COURSES_CACHE_KEY
    || key.startsWith('@cardinal_nodes_')
    || key.startsWith('@cardinal_layout_')
  ));
  if (courseKeys.length) await AsyncStorage.multiRemove(courseKeys);
}
