export type CourseOwnerType = 'student' | 'instructor';

/** The tabs are derived from the protected account type returned by the server. */
export function coursesByOwnerType<T extends { ownerType: CourseOwnerType }>(
  courses: readonly T[],
  ownerType: CourseOwnerType,
): T[] {
  return courses.filter((course) => course.ownerType === ownerType);
}
