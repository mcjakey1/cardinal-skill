/**
 * Cohort aggregates, and the suppression rule that guards them.
 *
 * The subtle half is the filter. An unfiltered class of thirty is safely above
 * the threshold, but "needs support, section A12" can be two people — and an
 * average computed over two people, shown beside a roster, identifies them. So
 * suppression is evaluated on the group actually being summarised, never on the
 * class it was drawn from.
 *
 * **What this rule now protects, and what it does not.** `0005_instructor_reads`
 * gives the owner of a course a per-student read of that course, so for that one
 * reader an average over three of their own students hides nothing they cannot
 * open the roster and see. The floor is kept because it is not only theirs: it
 * still guards every aggregate shown to anyone who is *not* the course owner —
 * a student comparing themselves to their class, a department view over courses
 * nobody in the room teaches. Screens must not describe it as anonymity from the
 * instructor, because it is not one any more.
 */

/** One student, as far as a class-level readout needs to know. */
export interface AnalyticsStudent {
  id: string;
  name: string;
  mastered: number;
  progress: number;
  streak: number;
  status: 'on-track' | 'needs-support';
}

/** Below this many students in the summarised group, no aggregate is returned. */
export const MIN_COHORT = 5;

export interface CohortSummary {
  size: number;
  averageProgress: number;
  averageMastered: number;
  averageStreak: number;
  needsSupport: number;
}

export type CohortResult =
  | { suppressed: false; summary: CohortSummary }
  | { suppressed: true; size: number; reason: string };

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

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
    };
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
  };
}

// ------------------------------------------------------------------- roster

/**
 * How long a student can clear nothing before it is worth an instructor's
 * attention. Two weeks: long enough to survive one missed week and a holiday,
 * short enough that a course notices before a term is lost.
 */
export const STALE_DAYS = 14;

/** One row of `course_student_progress`, as far as this rule needs to know. */
export interface RosterActivity {
  mastered: number;
  /** ISO timestamp of the last node this student cleared. */
  lastActive: string | null;
}

/**
 * A statement of fact about a roster row, or nothing.
 *
 * Deliberately not a judgement. "Needs support" was the obvious label and it is
 * the wrong one: this function knows when someone last cleared a node and
 * nothing else — not whether they are ill, ahead in another course, or working
 * on something that has no node. So it reports what happened and lets the person
 * who knows the student decide what it means.
 *
 * An unparseable or future timestamp reports nothing rather than guessing, which
 * keeps a clock-skewed device from flagging a class that is fine.
 */
export function activityFlag(row: RosterActivity, now: Date): 'not-started' | 'stale' | null {
  if (row.mastered === 0) return 'not-started';
  if (!row.lastActive) return null;

  const last = new Date(row.lastActive).getTime();
  if (Number.isNaN(last)) return null;

  const days = (now.getTime() - last) / 86_400_000;
  return days >= STALE_DAYS ? 'stale' : null;
}

/**
 * How far through the tree the class has collectively got, per skill.
 *
 * Used to find the node a class is stuck on. Suppressed by the same rule —
 * a per-skill breakdown over four students is still a breakdown over four
 * students.
 */
export interface SkillFriction {
  skillId: string;
  title: string;
  reachedCount: number;
  reachedPercent: number;
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
    };
  }

  const rows = skills.map((skill) => {
    const reachedCount = group.filter((s) => reachedBy(s, skill.id)).length;
    return {
      skillId: skill.id,
      title: skill.title,
      reachedCount,
      reachedPercent: Math.round((reachedCount / group.length) * 100),
    };
  });

  return { suppressed: false, rows };
}
