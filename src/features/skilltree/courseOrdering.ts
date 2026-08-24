import type { CourseOption } from './courseQueries';

/** Put a reordered filtered view back into its original visible slots. */
export function mergeVisibleCourseOrder(
  allCourses: readonly CourseOption[],
  visibleCourses: readonly CourseOption[],
): CourseOption[] {
  const visibleIds = new Set(visibleCourses.map((course) => course.id));
  let visibleIndex = 0;
  return allCourses.map((course, sortOrder) => {
    if (!visibleIds.has(course.id)) return { ...course, sortOrder };
    const replacement = visibleCourses[visibleIndex] ?? course;
    visibleIndex += 1;
    return { ...replacement, sortOrder };
  });
}

/** Apply this device's durable order and append newly discovered courses. */
export function applySavedCourseOrder(
  courses: readonly CourseOption[],
  savedIds: readonly string[],
): CourseOption[] {
  if (savedIds.length === 0) {
    return [...courses].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const rank = new Map(savedIds.map((id, index) => [id, index]));
  return [...courses]
    .sort((a, b) => {
      const aRank = rank.get(a.id);
      const bRank = rank.get(b.id);
      if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
      if (aRank !== undefined) return -1;
      if (bRank !== undefined) return 1;
      return a.sortOrder - b.sortOrder;
    })
    .map((course, sortOrder) => ({ ...course, sortOrder }));
}
