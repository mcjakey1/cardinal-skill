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
  /** Chart coordinates in tree space, assigned at generation time. */
  x: number;
  y: number;
  /** Tie-breaker for ordering suggestions; usually syllabus order. */
  sortOrder: number;
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
