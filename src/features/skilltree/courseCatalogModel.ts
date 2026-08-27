import type { CourseKind, CourseDiscoverability } from './courseDistribution';

export type CatalogKind = Extract<CourseKind, 'official' | 'community'>;
export type CommunityVisibility = Extract<CourseDiscoverability, 'unlisted' | 'public'>;

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
