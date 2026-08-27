import type { Mission, MissionDifficulty, SkillNode } from './types.ts';
import type { MissionState } from './missions.ts';

export type MissionSort = 'curriculum' | 'xp' | 'duration' | 'difficulty';
export type MissionFilter = 'open' | 'all' | 'done' | 'locked';

export interface MissionBoardRow {
  courseId: string;
  courseTitle: string;
  courseOrder: number;
  mission: Mission;
  missionOrder: number;
  node: SkillNode;
  state: MissionState;
  missingPrerequisites: string[];
}

export interface MissionModule {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  rows: MissionBoardRow[];
  completed: number;
  total: number;
}

const DIFFICULTY_RANK: Record<MissionDifficulty, number> = { easy: 1, medium: 2, hard: 3 };

export function missionDifficulty(mission: Mission, node: SkillNode): MissionDifficulty {
  if (mission.difficulty) return mission.difficulty;
  if (node.difficultyLabel === 'Advanced') return 'hard';
  if (node.difficultyLabel === 'Intermediate') return 'medium';
  if (node.difficultyLabel === 'Foundational') return 'easy';
  // Parser versions before v31 scaled XP from difficulty but did not persist
  // the label. Recover that original signal for already-imported courses.
  if (mission.xpReward >= 75) return 'hard';
  if (mission.xpReward <= 30) return 'easy';
  if (mission.kind === 'assessment' || mission.kind === 'project') return 'hard';
  if (mission.kind === 'assignment') return 'medium';
  return 'easy';
}

export function filterMissionRows(
  rows: readonly MissionBoardRow[],
  filter: MissionFilter,
): MissionBoardRow[] {
  return filter === 'all' ? [...rows] : rows.filter((row) => row.state === filter);
}

export function sortMissionRows(
  rows: readonly MissionBoardRow[],
  sort: MissionSort,
): MissionBoardRow[] {
  const curriculum = (a: MissionBoardRow, b: MissionBoardRow) =>
    a.courseOrder - b.courseOrder
    || a.node.sortOrder - b.node.sortOrder
    || a.missionOrder - b.missionOrder
    || a.mission.id.localeCompare(b.mission.id);

  return [...rows].sort((a, b) => {
    if (sort === 'xp') return b.mission.xpReward - a.mission.xpReward || curriculum(a, b);
    if (sort === 'duration') {
      return (a.mission.estimatedMinutes ?? Number.MAX_SAFE_INTEGER)
        - (b.mission.estimatedMinutes ?? Number.MAX_SAFE_INTEGER)
        || curriculum(a, b);
    }
    if (sort === 'difficulty') {
      return DIFFICULTY_RANK[missionDifficulty(b.mission, b.node)]
        - DIFFICULTY_RANK[missionDifficulty(a.mission, a.node)]
        || curriculum(a, b);
    }
    return curriculum(a, b);
  });
}

export function groupMissionRows(rows: readonly MissionBoardRow[]): MissionModule[] {
  const groups = new Map<string, MissionModule>();
  for (const row of rows) {
    const title = row.node.moduleName?.trim() || 'Course work';
    const id = `${row.courseId}:${title}`;
    const existing = groups.get(id);
    if (existing) {
      existing.rows.push(row);
      existing.total += 1;
      if (row.state === 'done') existing.completed += 1;
    } else {
      groups.set(id, {
        id,
        title,
        courseId: row.courseId,
        courseTitle: row.courseTitle,
        rows: [row],
        completed: row.state === 'done' ? 1 : 0,
        total: 1,
      });
    }
  }
  return [...groups.values()];
}

export function nextRecommendedMission(rows: readonly MissionBoardRow[]): MissionBoardRow | undefined {
  return sortMissionRows(rows.filter((row) => row.state === 'open'), 'curriculum')[0];
}

const TITLE_CASE_EXCEPTIONS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'up', 'via',
]);

/** Allows ordinary title case: significant words are capitalized; small connecting words may stay lower-case. */
export function isMissionTitleCase(value: string): boolean {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  return words.every((word, index) => {
    const letters = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
    if (!letters) return true;
    if (index > 0 && TITLE_CASE_EXCEPTIONS.has(letters.toLowerCase())) return letters === letters.toLowerCase();
    return /^[A-Z]/.test(letters);
  });
}
