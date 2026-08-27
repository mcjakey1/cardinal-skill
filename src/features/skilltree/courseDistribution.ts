export const COURSE_KINDS = ['practice', 'official', 'community'] as const;
export const COURSE_PUBLICATION_STATUSES = ['draft', 'published', 'archived'] as const;
export const COURSE_DISCOVERABILITIES = ['private', 'unlisted', 'public'] as const;

export type CourseKind = typeof COURSE_KINDS[number];
export type CoursePublicationStatus = typeof COURSE_PUBLICATION_STATUSES[number];
export type CourseDiscoverability = typeof COURSE_DISCOVERABILITIES[number];

export interface CourseDistribution {
  kind: CourseKind;
  publicationStatus: CoursePublicationStatus;
  discoverability: CourseDiscoverability;
  sourceCourseId: string | null;
}

export const PRIVATE_PRACTICE_DISTRIBUTION: CourseDistribution = {
  kind: 'practice',
  publicationStatus: 'draft',
  discoverability: 'private',
  sourceCourseId: null,
};

export function courseKindLabel(kind: CourseKind): string {
  if (kind === 'official') return 'Official';
  if (kind === 'community') return 'Student made';
  return 'Practice';
}

export function normalizeCourseDistribution(value: {
  course_kind?: unknown;
  publication_status?: unknown;
  discoverability?: unknown;
  source_course_id?: unknown;
}): CourseDistribution {
  const kind = COURSE_KINDS.includes(value.course_kind as CourseKind)
    ? value.course_kind as CourseKind
    : 'practice';
  const publicationStatus = COURSE_PUBLICATION_STATUSES.includes(
    value.publication_status as CoursePublicationStatus,
  ) ? value.publication_status as CoursePublicationStatus : 'draft';
  const discoverability = COURSE_DISCOVERABILITIES.includes(
    value.discoverability as CourseDiscoverability,
  ) ? value.discoverability as CourseDiscoverability : 'private';
  const sourceCourseId = typeof value.source_course_id === 'string' ? value.source_course_id : null;

  if (kind === 'practice') return { ...PRIVATE_PRACTICE_DISTRIBUTION, sourceCourseId };
  if (publicationStatus === 'draft') {
    return { kind, publicationStatus, discoverability: 'private', sourceCourseId };
  }
  if (publicationStatus === 'archived') {
    return { kind, publicationStatus, discoverability: 'private', sourceCourseId };
  }

  const safeDiscoverability = kind === 'official'
    ? 'public'
    : discoverability === 'public' ? 'public' : 'unlisted';

  return {
    kind,
    publicationStatus,
    discoverability: safeDiscoverability,
    sourceCourseId,
  };
}
