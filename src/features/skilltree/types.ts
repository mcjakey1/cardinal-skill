/** Shared shapes for the skill tree. Mirrors supabase/migrations/0001_init.sql. */

export type NodeKind = 'topic' | 'reading' | 'assignment' | 'assessment' | 'project';

/** Derived per user — never stored on the node itself. */
export type NodeStatus = 'locked' | 'available' | 'mastered';

export interface SkillNode {
  id: string;
  /** Set for course trees; null for universal tracks. */
  courseId: string | null;
  /** Set for universal tracks; null for course trees. */
  trackId: string | null;
  title: string;
  description: string;
  kind: NodeKind;
  xpReward: number;
  learningObjective?: string;
  estimatedMinutes?: number;
  moduleName?: string;
  difficultyLabel?: 'Foundational' | 'Intermediate' | 'Advanced';
  /** Chart coordinates in tree space, assigned at generation time. */
  x: number;
  y: number;
  /** Tie-breaker for ordering suggestions; usually syllabus order. */
  sortOrder: number;

  /**
   * Set on a supplemental help node: the syllabus node it was generated to
   * scaffold. Null on every node that came from the syllabus itself.
   */
  parentNodeId?: string | null;
  /**
   * False on supplemental help nodes. A help node earns XP and unlocks its
   * parent's path, but never contributes to a grade — it was requested by a
   * student who was stuck, and requesting help must not change what a course
   * is worth. The grade boundary lives on this flag, so anything that computes
   * a grade filters on it rather than guessing from `parentNodeId`.
   */
  graded?: boolean;
  /** Title an instructor typed by hand, overriding the generated one. */
  titleOverride?: string | null;
}

/** Directed edge: `nodeId` requires `prereqId` to be mastered first. */
export interface Prereq {
  nodeId: string;
  prereqId: string;
}

export interface Tree {
  nodes: SkillNode[];
  prereqs: Prereq[];
}

// ------------------------------------------------------------------ help subtrees

/**
 * One supplemental step, as returned by the `suggest-subtree` Edge Function
 * before it has been persisted. Ids are assigned on insert.
 */
export interface HelpStep {
  /** Stable slug, unique within the one request. */
  key: string;
  title: string;
  description: string;
  kind: NodeKind;
  /** Keys of earlier steps in the same subtree. Must not form a cycle. */
  prereqKeys: string[];
  estimatedMinutes?: number;
}

/** Who asked for the extra help. Both are allowed; the audit trail differs. */
export type HelpRequester = 'student' | 'instructor';

// ------------------------------------------------- adaptive learning engine

/**
 * What the app observed a learner do on one node. Every field is a count or a
 * duration, never a grade — the engine adapts pacing, not assessment.
 */
export interface NodeSignal {
  nodeId: string;
  attempts: number;
  /** Total time with the node open, milliseconds. */
  msSpent: number;
  hintsUsed: number;
  helpRequested: boolean;
  masteredAt?: string | null;
}

/** Everything the engine knows about one learner on one course. */
export interface LearnerSignals {
  nodeSignals: NodeSignal[];
  /** Consecutive days with at least one mastered node. */
  streakDays: number;
  /** Days since enrolment. Denominator for pace. */
  daysActive: number;
}

// -------------------------------------------------------------- quest naming

/** Generated names, either for a quest node or for an achievement. */
export interface QuestName {
  /** The node or achievement this names. */
  targetId: string;
  title: string;
  /** One line of flavour shown under the title. */
  subtitle: string;
  /** True once an instructor has typed their own title over the generated one. */
  isOverridden: boolean;
}
