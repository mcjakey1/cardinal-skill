/**
 * Streaks and achievements.
 *
 * Both are *derived*, never stored: an achievement is a question asked of the
 * chart and the completion log, so it can never disagree with what the student
 * actually did. Nothing here mints XP — XP comes from nodes, and an achievement
 * that paid out would quietly make the same work worth different amounts to
 * different students.
 *
 * Pure and dependency-free, same contract as `progression.ts`.
 */

import { deriveStatuses } from './progression.ts';
import type { SkillNode, Tree } from './types';

/** Local calendar day, so a streak follows the student's midnight, not UTC. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/**
 * Consecutive days ending today, counted backwards.
 *
 * A day that has not finished yet cannot break a streak, so activity yesterday
 * with none today still counts. Anything older is a broken streak, which is the
 * honest answer — a streak that never breaks is not a streak.
 */
export function streakDays(timestamps: Iterable<string>, today: Date = new Date()): number {
  const days = new Set<string>();
  for (const ts of timestamps) {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) days.add(dayKey(d));
  }
  if (days.size === 0) return 0;

  const start = days.has(dayKey(today)) ? today : addDays(today, -1);
  if (!days.has(dayKey(start))) return 0;

  let count = 0;
  for (let cursor = start; days.has(dayKey(cursor)); cursor = addDays(cursor, -1)) count += 1;
  return count;
}

export interface Achievement {
  id: string;
  title: string;
  /** What earns it, in the student's own words. Present tense, no exclamation. */
  detail: string;
  earned: boolean;
  /** Progress toward it, 0–1. Drives the meter on an unearned stamp. */
  progress: number;
  /** Human-readable numerator and denominator for the locked stamp. */
  current: number;
  target: number;
}

const STREAK_TARGET = 7;
const OPEN_PATHS_TARGET = 3;

/**
 * Every achievement, earned or not, in a stable order.
 *
 * Unearned ones are returned too: a locked stamp with its condition written on
 * it is the only way a student finds out what the game even is.
 */
export function achievements(
  tree: Tree,
  masteredIds: Iterable<string>,
  streak: number,
): Achievement[] {
  const mastered = new Set(masteredIds);
  const nodes = tree.nodes;
  const total = nodes.length;
  const clearedCount = nodes.filter((n) => mastered.has(n.id)).length;

  const { status } = deriveStatuses(tree, mastered);
  const openCount = nodes.filter((n) => status.get(n.id) === 'available').length;

  const assessments = nodes.filter((n) => n.kind === 'assessment' || n.kind === 'project');
  const assessmentsCleared = assessments.filter((n) => mastered.has(n.id)).length;

  const half = Math.ceil(total / 2);

  return [
    stamp('first-clear', 'First light', 'Clear one node.', clearedCount, 1),
    stamp(
      'path-opener',
      'Path opener',
      `Have ${OPEN_PATHS_TARGET} nodes open at the same time.`,
      openCount,
      OPEN_PATHS_TARGET,
    ),
    stamp(
      'examined',
      'Examined',
      'Clear an assessment or a project.',
      assessmentsCleared,
      assessments.length > 0 ? 1 : 0,
    ),
    stamp('halfway', 'Halfway', 'Master half the chart.', clearedCount, half),
    stamp('week', 'Seven days', `Return ${STREAK_TARGET} days running.`, streak, STREAK_TARGET),
    stamp('cleared', 'Chart cleared', 'Master every node on the chart.', clearedCount, total),
  ];
}

function stamp(
  id: string,
  title: string,
  detail: string,
  have: number,
  need: number,
): Achievement {
  // A target of zero means the chart cannot offer this one at all (no
  // assessments, no nodes). Unreachable is not earned.
  if (need <= 0) return { id, title, detail, earned: false, progress: 0, current: 0, target: 0 };
  return {
    id,
    title,
    detail,
    earned: have >= need,
    progress: Math.max(0, Math.min(1, have / need)),
    current: Math.max(0, have),
    target: need,
  };
}

/** XP a chart is worth, restricted to graded nodes. Help nodes never count. */
export function gradedXp(nodes: SkillNode[]): number {
  return nodes.filter((n) => n.graded !== false).reduce((sum, n) => sum + n.xpReward, 0);
}
