/**
 * One runnable check on the shape conversion. The XP rules themselves are
 * covered by the shared suite; what can break here is the translation — losing
 * the parent's XP patch (which mints XP) or losing the edges back to the parent
 * (which makes the scaffold decorative).
 *
 * Run:
 *   node --test --experimental-strip-types frontend/lib/help-subtree.test.ts
 *
 * Not in the root `npm test` glob, which is scoped to `src/**`.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHelpSubtree } from '../../src/features/skilltree/subtree.ts'
import {
  fragmentMissionXp,
  missionsForNode,
  nodeXpFromMissions
} from '../../src/features/skilltree/missions.ts'
import { graftHelpSubtree } from './help-subtree.ts'
import { mockCS210Payload, prototypeMissions } from './cardinal-repository.ts'
import type { SkillNode as DomainSkillNode } from './cardinal-domain.ts'
import type { HelpStep, SkillNode as SharedNode } from '../../src/features/skilltree/types.ts'

const parent: DomainSkillNode = {
  id: 'skill_7',
  title: 'Trees & Traversal',
  status: 'available',
  xpReward: 250,
  prerequisiteIds: ['skill_5'],
  icon: 'network'
}

const sharedParent: SharedNode = {
  id: parent.id,
  courseId: 'cs210',
  trackId: null,
  title: parent.title,
  description: '',
  kind: 'topic',
  xpReward: parent.xpReward!,
  x: 0,
  y: 0,
  sortOrder: 6
}

const steps: HelpStep[] = [
  { key: 'a', title: 'Step a', description: '', kind: 'reading', prereqKeys: [] },
  { key: 'b', title: 'Step b', description: '', kind: 'assignment', prereqKeys: ['a'] },
  { key: 'c', title: 'Step c', description: '', kind: 'assessment', prereqKeys: ['b'] }
]

const graft = graftHelpSubtree(parent, buildHelpSubtree(sharedParent, steps, key => `help_${key}`))

test('fragmentation is conservative once the graft is applied', () => {
  const stepXp = graft.nodes.reduce((sum, n) => sum + (n.xpReward ?? 0), 0)
  assert.equal(graft.parentPatch.xpReward + stepXp, parent.xpReward)
  assert.ok(stepXp > 0, 'the steps should carry some of the parent reward')
})

test('steps are supplemental, chained, and gate the parent', () => {
  assert.deepEqual(graft.nodes.map(n => n.graded), [false, false, false])
  assert.deepEqual(graft.nodes.map(n => n.prerequisiteIds), [[], ['help_a'], ['help_b']])
  // Syllabus prerequisites survive; the terminal step is added to them.
  assert.deepEqual(graft.parentPatch.prerequisiteIds, ['skill_5', 'help_c'])
})

test('every CS210 skill is worth exactly the sum of its missions', () => {
  for (const node of mockCS210Payload.nodes) {
    const own = missionsForNode(prototypeMissions, node.id)
    assert.ok(own.length > 0, `${node.id} has no missions, so the chart would show it as worth nothing`)
    assert.equal(
      nodeXpFromMissions(prototypeMissions, node.id),
      node.xpReward,
      `${node.id}: missions sum to ${nodeXpFromMissions(prototypeMissions, node.id)}, node says ${node.xpReward}`
    )
    // The fixture's own bookkeeping, which the panel does not read but a human does.
    assert.deepEqual(node.missionIds, own.map(m => m.id), `${node.id} lists the wrong mission ids`)
  }
})

test('asking for extra help re-slices a node without changing what it is worth', () => {
  // The same two steps the app takes: `buildHelpSubtree` for structure, then
  // `fragmentMissionXp` over the missions for every XP number.
  for (const nodeId of ['skill_4', 'skill_7', 'skill_8', 'skill_9', 'skill_10', 'skill_14']) {
    const before = nodeXpFromMissions(prototypeMissions, nodeId)
    const own = missionsForNode(prototypeMissions, nodeId)

    const subtree = buildHelpSubtree({ ...sharedParent, id: nodeId }, steps, key => `help_${key}`)
    const { missionRewards, stepRewards } = fragmentMissionXp(
      own.map(m => m.xpReward),
      subtree.nodes.length
    )
    const grafted = graftHelpSubtree(
      { ...parent, id: nodeId },
      { ...subtree, nodes: subtree.nodes.map((s, i) => ({ ...s, xpReward: stepRewards[i] ?? 0 })) }
    )

    const after =
      missionRewards.reduce((sum, xp) => sum + xp, 0) +
      grafted.nodes.reduce((sum, n) => sum + (n.xpReward ?? 0), 0)

    assert.equal(after, before, `${nodeId} was worth ${before} XP and is now worth ${after}`)
    assert.ok(stepRewards.every(xp => xp > 0), `${nodeId}: a step worth 0 XP is not extra practice`)
  }
})
