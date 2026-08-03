import dagre from 'dagre'
import type { SkillNode } from './cardinal-domain'

export interface LayoutResult {
  nodes: (SkillNode & { position: { x: number; y: number } })[]
  width: number
  height: number
}

export function computeAutoLayout(
  nodes: SkillNode[],
  config: {
    nodeWidth?: number
    nodeHeight?: number
    rankSep?: number
    nodeSep?: number
  } = {}
): LayoutResult {
  if (!nodes || nodes.length === 0) {
    return { nodes: [], width: 960, height: 860 }
  }

  const nodeWidth = config.nodeWidth || 150
  const nodeHeight = config.nodeHeight || 120
  const rankSep = config.rankSep || 135 // vertical layer spacing
  const nodeSep = config.nodeSep || 110 // horizontal sibling spacing

  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: 'TB', // Top-to-Bottom
    ranksep: rankSep,
    nodesep: nodeSep,
    marginx: 100,
    marginy: 100
  })
  g.setDefaultEdgeLabel(() => ({}))

  // Add nodes
  nodes.forEach(node => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })

  // Add edges: prerequisite -> node
  nodes.forEach(node => {
    node.prerequisiteIds.forEach(prereqId => {
      // Ensure prereq exists in node list before adding edge to avoid dagre crash
      if (nodes.some(n => n.id === prereqId)) {
        g.setEdge(prereqId, node.id)
      }
    })
  })

  // Run layout
  dagre.layout(g)

  const graphInfo = g.graph()
  const graphWidth = Math.max(960, Math.round((graphInfo.width || 960) + 200))
  const graphHeight = Math.max(860, Math.round((graphInfo.height || 860) + 200))

  // Center calculated node positions inside graph dimensions
  const layoutNodes = nodes.map(node => {
    const dagreNode = g.node(node.id)
    const x = dagreNode ? Math.round(dagreNode.x) : 480
    const y = dagreNode ? Math.round(dagreNode.y) : 430
    return {
      ...node,
      position: { x, y }
    }
  })

  return {
    nodes: layoutNodes,
    width: graphWidth,
    height: graphHeight
  }
}
