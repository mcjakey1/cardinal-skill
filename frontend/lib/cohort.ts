/**
 * Cohort aggregates, and the suppression rule that guards them.
 *
 * PRODUCT.md states the invariant this file exists to keep: instructor views
 * return class-level aggregates suppressed below five students, and never a
 * named student's grades.
 *
 * The subtle half is the filter. An unfiltered class of thirty is safely above
 * the threshold, but "needs support, section A12" can be two people — and an
 * average computed over two people, shown beside a roster, identifies them. So
 * suppression is evaluated on the group actually being summarised, never on the
 * class it was drawn from.
 */

import type { AnalyticsStudent } from './cardinal-domain'

/** Below this many students in the summarised group, no aggregate is returned. */
export const MIN_COHORT = 5

export interface CohortSummary {
  size: number
  averageProgress: number
  averageMastered: number
  averageStreak: number
  needsSupport: number
}

export type CohortResult =
  | { suppressed: false; summary: CohortSummary }
  | { suppressed: true; size: number; reason: string }

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length)

/**
 * Summarise a group, or refuse to.
 *
 * Takes the group as given. Callers filter first and pass the result; passing a
 * whole class and a predicate would make it far too easy to check the threshold
 * against the wrong set.
 */
export function summariseCohort(group: AnalyticsStudent[]): CohortResult {
  if (group.length < MIN_COHORT) {
    return {
      suppressed: true,
      size: group.length,
      reason: `Fewer than ${MIN_COHORT} students match. Figures are hidden so no individual can be identified.`,
    }
  }

  return {
    suppressed: false,
    summary: {
      size: group.length,
      averageProgress: mean(group.map((s) => s.progress)),
      averageMastered: mean(group.map((s) => s.mastered)),
      averageStreak: mean(group.map((s) => s.streak)),
      needsSupport: group.filter((s) => s.status === 'needs-support').length,
    },
  }
}

/**
 * How far through the tree the class has collectively got, per skill.
 *
 * Used to find the node a class is stuck on. Suppressed by the same rule —
 * a per-skill breakdown over four students is still a breakdown over four
 * students.
 */
export interface SkillFriction {
  skillId: string
  title: string
  reachedCount: number
  reachedPercent: number
}

export function skillFriction(
  group: AnalyticsStudent[],
  skills: { id: string; title: string }[],
  reachedBy: (student: AnalyticsStudent, skillId: string) => boolean,
): { suppressed: true; reason: string } | { suppressed: false; rows: SkillFriction[] } {
  if (group.length < MIN_COHORT) {
    return {
      suppressed: true,
      reason: `Fewer than ${MIN_COHORT} students match. Per-skill figures are hidden.`,
    }
  }

  const rows = skills.map((skill) => {
    const reachedCount = group.filter((s) => reachedBy(s, skill.id)).length
    return {
      skillId: skill.id,
      title: skill.title,
      reachedCount,
      reachedPercent: Math.round((reachedCount / group.length) * 100),
    }
  })

  return { suppressed: false, rows }
}
