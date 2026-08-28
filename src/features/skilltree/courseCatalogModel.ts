import type { CourseKind } from './courseDistribution';

export type CatalogKind = Extract<CourseKind, 'official' | 'community'>;
export type CommunityVisibility = 'public';

export interface CatalogCourse {
  id: string;
  courseCode: string | null;
  title: string;
  term: string | null;
  description: string;
  units: number | null;
  kind: CatalogKind;
  ownerDisplayName: string;
  learnerCount: number;
  isJoined: boolean;
  publishedAt: string;
}

export interface CatalogRow {
  course_id?: unknown;
  course_code?: unknown;
  title?: unknown;
  term?: unknown;
  description?: unknown;
  units?: unknown;
  course_kind?: unknown;
  owner_display_name?: unknown;
  learner_count?: unknown;
  is_joined?: unknown;
  published_at?: unknown;
}

export function normalizeCatalogCourses(rows: readonly CatalogRow[]): CatalogCourse[] {
  return rows.flatMap((row) => {
    if (
      typeof row.course_id !== 'string'
      || typeof row.title !== 'string'
      || !row.title.trim()
      || (row.course_kind !== 'official' && row.course_kind !== 'community')
      || typeof row.published_at !== 'string'
    ) return [];

    const learnerCount = Number(row.learner_count);
    const units = row.units === null || row.units === undefined ? null : Number(row.units);
    return [{
      id: row.course_id,
      courseCode: typeof row.course_code === 'string' ? row.course_code : null,
      title: row.title.trim(),
      term: typeof row.term === 'string' ? row.term : null,
      description: typeof row.description === 'string' ? row.description : '',
      units: units !== null && Number.isFinite(units) ? units : null,
      kind: row.course_kind,
      ownerDisplayName: typeof row.owner_display_name === 'string' && row.owner_display_name.trim()
        ? row.owner_display_name.trim()
        : row.course_kind === 'official' ? 'Verified instructor' : 'Student author',
      learnerCount: Number.isFinite(learnerCount) ? Math.max(0, Math.floor(learnerCount)) : 0,
      isJoined: row.is_joined === true,
      publishedAt: row.published_at,
    }];
  });
}

/**
 * How long after publication an official course still reads as new.
 *
 * Bounded so a course nobody ever opens stops shouting: without a window, a row
 * published last term stays marked forever for every student who never joined.
 */
export const NEW_COURSE_WINDOW_DAYS = 14;

const NEW_COURSE_WINDOW_MS = NEW_COURSE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Is this catalog row new for the student looking at it?
 *
 * Pure on purpose: the seen ids and the clock are arguments, so the rule is
 * testable with no storage, no React, and no Supabase. A joined course is never
 * new — joining is the only way a student opens a catalog course, so the server
 * flag alone already covers every course opened before the seen set existed.
 */
export function isNewCatalogCourse(
  course: Pick<CatalogCourse, 'id' | 'kind' | 'isJoined' | 'publishedAt'>,
  seenCourseIds: ReadonlySet<string>,
  now: number,
): boolean {
  if (course.kind !== 'official') return false;
  if (course.isJoined || seenCourseIds.has(course.id)) return false;
  const publishedAt = Date.parse(course.publishedAt);
  if (Number.isNaN(publishedAt)) return false;
  return now - publishedAt <= NEW_COURSE_WINDOW_MS;
}
