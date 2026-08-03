/**
 * Pure progression rules for Cardinal Skill:
 * Graph status derivation, level calculation, and quest suggestions.
 */

export type NodeStatus = 'locked' | 'available' | 'mastered' | 'active'

export interface SkillNodeInput {
  id: string
  title: string
  xpReward: number
  sortOrder?: number
}

export interface PrereqInput {
  nodeId: string
  prereqId: string
}

export interface TreeInput {
  nodes: SkillNodeInput[]
  prereqs: PrereqInput[]
}

export const XP_PER_LEVEL = 100

export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1
  return Math.floor(Math.sqrt(xp / XP_PER_LEVEL)) + 1
}

export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  return XP_PER_LEVEL * (level - 1) ** 2
}

export function levelProgress(xp: number): number {
  const level = levelForXp(xp)
  const floor = xpForLevel(level)
  const ceiling = xpForLevel(level + 1)
  return (xp - floor) / (ceiling - floor)
}

export interface StatusResult {
  status: Map<string, NodeStatus>
  cyclicNodeIds: string[]
}

export function deriveStatuses(tree: TreeInput, masteredIds: Iterable<string>): StatusResult {
  const known = new Set(tree.nodes.map((n) => n.id))
  const mastered = new Set([...masteredIds].filter((id) => known.has(id)))

  const prereqsOf = new Map<string, string[]>()
  for (const { nodeId, prereqId } of tree.prereqs) {
    if (!known.has(nodeId) || !known.has(prereqId) || nodeId === prereqId) continue
    const list = prereqsOf.get(nodeId)
    if (list) list.push(prereqId)
    else prereqsOf.set(nodeId, [prereqId])
  }

  const cyclic = new Set(findCyclicNodes(known, prereqsOf))
  const status = new Map<string, NodeStatus>()

  for (const node of tree.nodes) {
    if (mastered.has(node.id)) {
      status.set(node.id, 'mastered')
      continue
    }
    if (cyclic.has(node.id)) {
      status.set(node.id, 'locked')
      continue
    }
    const unmet = (prereqsOf.get(node.id) ?? []).some((id) => !mastered.has(id))
    status.set(node.id, unmet ? 'locked' : 'available')
  }

  return { status, cyclicNodeIds: [...cyclic] }
}

function findCyclicNodes(known: Set<string>, prereqsOf: Map<string, string[]>): string[] {
  const WHITE = 0
  const GREY = 1
  const BLACK = 2
  const colour = new Map<string, number>()
  const bad = new Set<string>()

  for (const start of known) {
    if (colour.get(start) !== undefined) continue
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }]
    colour.set(start, GREY)

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!
      const edges = prereqsOf.get(frame.id) ?? []

      if (frame.next >= edges.length) {
        colour.set(frame.id, BLACK)
        stack.pop()
        continue
      }

      const child = edges[frame.next]!
      frame.next += 1

      const childColour = colour.get(child) ?? WHITE
      if (childColour === GREY) {
        for (const f of stack) bad.add(f.id)
      } else if (childColour === WHITE) {
        colour.set(child, GREY)
        stack.push({ id: child, next: 0 })
      } else if (bad.has(child)) {
        bad.add(frame.id)
      }
    }
  }

  return [...bad]
}
