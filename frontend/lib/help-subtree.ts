/**
 * Translate a shared `HelpSubtree` into this app's node shape.
 *
 * The XP arithmetic is not here — `buildHelpSubtree` in `@shared/subtree` does
 * it, and it is the same code the Expo app and the Edge Function run. This file
 * only converts the result: shared nodes carry prerequisites as an edge list,
 * this app carries them as `prerequisiteIds` on the node.
 *
 * Type-only imports from `@shared/*` on purpose, so this file runs under
 * `node --test --experimental-strip-types` without a path alias.
 */

import type { HelpSubtree } from '@shared/subtree'
import type { SkillNode as DomainSkillNode } from './cardinal-domain'

export interface HelpGraft {
  /** The supplemental steps, ready to append to the tree. */
  nodes: DomainSkillNode[]
  /**
   * Apply to the parent in the same update that appends `nodes`. Applying one
   * without the other either mints XP or leaves the scaffold decorative.
   */
  parentPatch: { id: string; xpReward: number; prerequisiteIds: string[] }
}

export function graftHelpSubtree(parent: DomainSkillNode, subtree: HelpSubtree): HelpGraft {
  const prereqsOf = (nodeId: string) =>
    subtree.prereqs.filter(p => p.nodeId === nodeId).map(p => p.prereqId)

  return {
    nodes: subtree.nodes.map(step => ({
      id: step.id,
      title: step.title,
      shortTitle: step.title,
      description: step.description,
      // Real status is derived from the graph by `deriveStatuses`; this column
      // is the payload's stored guess and is never read once the tree renders.
      status: 'available' as const,
      xpReward: step.xpReward,
      estimatedMinutes: step.estimatedMinutes,
      moduleName: `Extra practice for ${parent.shortTitle || parent.title}`,
      difficultyLabel: 'Foundational' as const,
      prerequisiteIds: prereqsOf(step.id),
      icon: parent.icon,
      parentNodeId: parent.id,
      graded: false
    })),
    parentPatch: {
      id: parent.id,
      xpReward: subtree.parentPatch.xpReward,
      // The terminal steps become prerequisites of the parent, on top of what
      // the syllabus already required.
      prerequisiteIds: [...parent.prerequisiteIds, ...prereqsOf(parent.id)]
    }
  }
}
