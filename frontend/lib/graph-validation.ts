import type { SkillNode } from './cardinal-domain'

export interface GraphValidationError {
  type: 'missing_prerequisite' | 'cycle_detected' | 'duplicate_id'
  message: string
  details?: string
}

export function validateSkillGraph(nodes: SkillNode[]): { isValid: boolean; errors: GraphValidationError[] } {
  const errors: GraphValidationError[] = []
  const nodeMap = new Map<string, SkillNode>()

  // 1. Check for duplicate IDs
  nodes.forEach(node => {
    if (nodeMap.has(node.id)) {
      errors.push({
        type: 'duplicate_id',
        message: `Duplicate skill node ID: "${node.id}".`,
        details: `Skill "${node.title}" shares the same ID as another node.`
      })
    } else {
      nodeMap.set(node.id, node)
    }
  })

  // 2. Check for missing prerequisite references
  nodes.forEach(node => {
    node.prerequisiteIds.forEach(prereqId => {
      if (!nodeMap.has(prereqId)) {
        errors.push({
          type: 'missing_prerequisite',
          message: `Missing prerequisite node reference.`,
          details: `Skill "${node.title}" (${node.id}) references unknown prerequisite "${prereqId}".`
        })
      }
    })
  })

  // 3. Cycle Detection using DFS
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const cyclePath: string[] = []

  function dfs(id: string): boolean {
    visited.add(id)
    inStack.add(id)

    const node = nodeMap.get(id)
    if (node) {
      for (const prereqId of node.prerequisiteIds) {
        if (!visited.has(prereqId)) {
          if (dfs(prereqId)) {
            cyclePath.push(id)
            return true
          }
        } else if (inStack.has(prereqId)) {
          cyclePath.push(prereqId)
          cyclePath.push(id)
          return true
        }
      }
    }

    inStack.delete(id)
    return false
  }

  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) {
        errors.push({
          type: 'cycle_detected',
          message: `Dependency cycle detected in prerequisite graph.`,
          details: `Cycle path: ${cyclePath.reverse().join(' -> ')}`
        })
      }
    }
  })

  return { isValid: errors.length === 0, errors }
}
