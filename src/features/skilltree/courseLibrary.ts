import type { CourseOption } from './courseQueries';

export type CourseLibraryTab = 'mine' | 'playground' | 'community';

export function catalogKindForTab(tab: CourseLibraryTab): 'official' | 'community' | null {
  if (tab === 'mine') return 'official';
  if (tab === 'community') return 'community';
  return null;
}

export function playgroundCourses(courses: readonly CourseOption[]): CourseOption[] {
  return courses.filter((course) => course.canEdit && course.kind !== 'official');
}
