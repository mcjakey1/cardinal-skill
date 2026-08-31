import type { CatalogCourse, CatalogKind } from './courseCatalogModel';

/** Published-course fixtures for privacy-safe screenshots of the catalog tabs. */
const official: readonly CatalogCourse[] = [
  course('demo', 'MATH 220', 'Discrete Mathematics', 'Dr. Maya Santos', 42, 3, 'Logic, proofs, counting, graphs, and recurrence through a connected skill tree.'),
  course('demo-cs201', 'CS 201', 'Data Structures & Algorithms', 'Dr. Adrian Villanueva', 36, 4, 'Build efficient structures, trace algorithms, and explain their tradeoffs.'),
  course('demo-cpe102', 'CPE 102', 'Digital Logic Design', 'Prof. Elena Navarro', 28, 3, 'Move from Boolean algebra to circuits, timing, and finite-state machines.'),
  course('demo-chem210', 'CHEM 210', 'Organic Chemistry', 'Dr. Amina Velasco', 31, 4, 'Recognize functional groups, predict mechanisms, and interpret spectra.'),
];

const community: readonly CatalogCourse[] = [
  { ...course('demo-cs201', 'CS LAB', 'Algorithm Interview Lab', 'Noah Kim', 118, null, 'A student-built sequence of tracing drills and timed practice.'), kind: 'community' },
  { ...course('demo-cpe102', 'ECE PACK', 'Logic Circuit Challenge Pack', 'Sofia Mendoza', 74, null, 'Progressive design challenges for gates, adders, and controllers.'), kind: 'community' },
];

export function demoCatalog(kind: CatalogKind | null): readonly CatalogCourse[] {
  if (kind === 'official') return official;
  if (kind === 'community') return community;
  return [];
}

function course(
  id: string,
  courseCode: string,
  title: string,
  ownerDisplayName: string,
  learnerCount: number,
  units: number | null,
  description: string,
): CatalogCourse {
  return {
    id,
    courseCode,
    title,
    term: 'AY 2026',
    description,
    units,
    kind: 'official',
    ownerDisplayName,
    learnerCount,
    isJoined: true,
    publishedAt: '2026-08-25T09:00:00.000Z',
  };
}
