export class CourseUnavailableError extends Error {
  constructor() {
    super('This course was deleted or is no longer available.');
    this.name = 'CourseUnavailableError';
  }
}

/** A missing row and an empty chart is absence, not a blank unnamed course. */
export function requireAvailableCourse<T>(course: T | null, nodeCount: number): T | null {
  if (!course && nodeCount === 0) throw new CourseUnavailableError();
  return course;
}
