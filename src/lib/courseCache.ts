import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CourseMetadata, CourseOption } from '@/features/skilltree/courseQueries';
import { normalizeCourseDistribution, PRIVATE_PRACTICE_DISTRIBUTION } from '@/features/skilltree/courseDistribution';
import type { TreeSnapshot } from '@/features/skilltree/queries';
import { COURSE_ORDER_CACHE_KEY, COURSES_CACHE_KEY, courseTreeCacheKey, isCourseScopedCacheKey } from './courseCacheKeys';

export { COURSE_ORDER_CACHE_KEY, COURSES_CACHE_KEY, courseTreeCacheKey } from './courseCacheKeys';

type CachedCourse = CourseOption;

interface CachedTreeEnvelope {
  version: 1;
  snapshot: TreeSnapshot;
}

export interface CachedCourseOrder {
  ids: string[];
  pendingSync: boolean;
}

let courseOrderWrites: Promise<void> = Promise.resolve();

function queueCourseOrderWrite(write: () => Promise<void>): Promise<void> {
  const operation = courseOrderWrites.then(write);
  courseOrderWrites = operation.catch(() => {});
  return operation;
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
        )).map((course, index) => ({
          ...course,
          ...normalizeCourseDistribution({
            course_kind: course.kind,
            publication_status: course.publicationStatus,
            discoverability: course.discoverability,
            source_course_id: course.sourceCourseId,
          }),
          isFixture: false,
          sortOrder: typeof course.sortOrder === 'number' ? course.sortOrder : index,
        }))
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

export async function loadCachedCourseOrder(): Promise<CachedCourseOrder> {
  try {
    const raw = await AsyncStorage.getItem(COURSE_ORDER_CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { ids: [], pendingSync: false };
    const candidate = parsed as Partial<{ version: number; ids: unknown; pendingSync: unknown }>;
    return candidate.version === 1 && Array.isArray(candidate.ids)
      ? {
          ids: candidate.ids.filter((id): id is string => typeof id === 'string'),
          pendingSync: candidate.pendingSync === true,
        }
      : { ids: [], pendingSync: false };
  } catch {
    return { ids: [], pendingSync: false };
  }
}

export async function cacheCourseOrder(
  ids: readonly string[],
  pendingSync: boolean,
): Promise<void> {
  await queueCourseOrderWrite(() => AsyncStorage.setItem(COURSE_ORDER_CACHE_KEY, JSON.stringify({
    version: 1,
    ids: [...ids],
    pendingSync,
  })));
}

export async function markCourseOrderSynced(
  ids: readonly string[],
  expectedLocalIds: readonly string[] = ids,
): Promise<void> {
  await queueCourseOrderWrite(async () => {
    const current = await loadCachedCourseOrder();
    if (
      current.ids.length !== expectedLocalIds.length
      || current.ids.some((id, index) => id !== expectedLocalIds[index])
    ) return;
    await AsyncStorage.setItem(COURSE_ORDER_CACHE_KEY, JSON.stringify({
      version: 1,
      ids: [...ids],
      pendingSync: false,
    }));
  });
}

export async function cacheParsedCourse(
  course: Pick<CachedCourse, 'id' | 'courseCode' | 'title' | 'term'>,
  snapshot: TreeSnapshot,
): Promise<void> {
  const courses = await readCourses();
  const next: CachedCourse[] = [
    { ...course, ...PRIVATE_PRACTICE_DISTRIBUTION, canEdit: true, canDelete: true, canRemove: false, isFixture: false, sortOrder: 0 },
    ...courses.filter((item) => item.id !== course.id),
  ];
  const order = await loadCachedCourseOrder();
  await AsyncStorage.multiSet([
    [COURSES_CACHE_KEY, JSON.stringify(next)],
    [courseTreeCacheKey(course.id), JSON.stringify({ version: 1, snapshot } satisfies CachedTreeEnvelope)],
  ]);
  await cacheCourseOrder([course.id, ...order.ids.filter((id) => id !== course.id)], true);
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
  const order = await loadCachedCourseOrder();
  await AsyncStorage.setItem(
    COURSES_CACHE_KEY,
    JSON.stringify(courses.filter((course) => course.id !== courseId)),
  );
  await cacheCourseOrder(
    order.ids.filter((id) => id !== courseId),
    order.pendingSync,
  );
  await AsyncStorage.removeItem(courseTreeCacheKey(courseId));
}

/**
 * Everything the signed-out account left on this device.
 *
 * Named the four course keys and stopped there, which left the completion logs
 * behind: on the next sign-in `progress.ts` flushes whatever it finds under the
 * new session, and `set_node_completion` writes it for the new `auth.uid()`.
 * On a shared machine that credits one student with another's work. The family
 * test lives in `courseCacheKeys.ts` so it can be checked without a device.
 */
export async function clearCourseCaches(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const courseKeys = keys.filter(isCourseScopedCacheKey);
  if (courseKeys.length) await AsyncStorage.multiRemove(courseKeys);
}
