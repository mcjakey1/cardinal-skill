/**
 * Adapter over the shared progression rules in `src/features/skilltree/`.
 *
 * This file used to be a verbatim second copy of those rules. Two copies of an
 * unlock rule is how a student ends up seeing a node as available on the web and
 * locked on their phone, so the logic now lives in exactly one place, under one
 * `node --test` suite, and this file only translates shapes.
 *
 * The translation is real work, not ceremony: this app stores prerequisites as
 * `prerequisiteIds` on the node, the shared model stores them as edges.
 */

import {
  deriveStatuses as sharedDeriveStatuses,
  evaluateSkillUnlockState as sharedEvaluate,
} from '@shared/progression'
import type { Prereq, SkillNode as SharedNode, Tree } from '@shared/types'

export {
  levelForXp,
  levelProgress,
  totalXp,
  xpForLevel,
  XP_PER_LEVEL,
} from '@shared/progression'
export type {
  SkillEligibility,
  SkillEligibilityPrereqInfo,
  StatusResult,
} from '@shared/progression'

/** What this app's components actually hold. Everything else is optional. */
export interface SkillLike {
  id: string
  title?: string
  xpReward?: number
  prerequisiteIds?: string[]
  parentNodeId?: string | null
  graded?: boolean
}

export type NodeStatus = 'locked' | 'available' | 'mastered' | 'active'

/**
 * Widen this app's node shape to the shared one.
 *
 * ponytail: the placeholder fields (`x`, `y`, `kind`, …) are never read by the
 * status or eligibility rules — only ids and edges are. They exist to satisfy
 * the shared type. If the shared rules ever start reading geometry, this lie
 * becomes a bug, so keep them structural-only.
 */
export function treeFromSkills(skills: SkillLike[]): Tree {
  const known = new Set(skills.map((s) => s.id))

  const nodes: SharedNode[] = skills.map((s, i) => ({
    id: s.id,
    courseId: null,
    trackId: null,
    title: s.title ?? s.id,
    description: '',
    kind: 'topic',
    xpReward: s.xpReward ?? 0,
    x: 0,
    y: 0,
    sortOrder: i,
    parentNodeId: s.parentNodeId ?? null,
    graded: s.graded ?? true,
  }))

  // Edges naming a node that isn't in this tree are dropped here rather than
  // passed through — the shared rules drop them too, but a caller reading
  // `tree.prereqs` directly would otherwise see a dangling edge.
  const prereqs: Prereq[] = skills.flatMap((s) =>
    (s.prerequisiteIds ?? [])
      .filter((p) => known.has(p))
      .map((prereqId) => ({ nodeId: s.id, prereqId })),
  )

  return { nodes, prereqs }
}

export function deriveStatuses(skills: SkillLike[], masteredIds: Iterable<string>) {
  return sharedDeriveStatuses(treeFromSkills(skills), masteredIds)
}

export function evaluateSkillUnlockState(
  skillId: string,
  skills: SkillLike[],
  masteredIds: Iterable<string>,
) {
  return sharedEvaluate(skillId, treeFromSkills(skills), masteredIds)
}

export function getSkillEligibility(
  skillId: string,
  skills: SkillLike[],
  masteredIds: Iterable<string>,
) {
  return evaluateSkillUnlockState(skillId, skills, masteredIds)
}
