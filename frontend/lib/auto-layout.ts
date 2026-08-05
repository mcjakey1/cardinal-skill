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

  const nodeWidth = config.nodeWidth || 140
  const nodeHeight = config.nodeHeight || 110
  const rankSep = config.rankSep || 95  // Compact vertical layer spacing (80-110px range)
  const nodeSep = config.nodeSep || 75  // Compact horizontal sibling spacing (65-90px range)

  const isHelp = (n: SkillNode) => Boolean(n.parentNodeId)
  const byId = new Map(nodes.map(n => [n.id, n]))

  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: 'TB', // Top-to-Bottom
    ranksep: rankSep,
    nodesep: nodeSep,
    marginx: 80,
    marginy: 80
  })
  g.setDefaultEdgeLabel(() => ({}))

  // Everything is ranked, help steps included. They used to be hand-placed in a
  // column beside their parent with no collision check, which drew a scaffold
  // straight over whatever else happened to be there. Dagre is the only thing
  // here that can actually make room, so it gets the whole graph.
  nodes.forEach(node => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })

  // Edges: prerequisite -> node. A help step is a real prerequisite of the node
  // it scaffolds, so this alone puts each cluster above its parent.
  nodes.forEach(node => {
    (node.prerequisiteIds || []).forEach(prereqId => {
      if (byId.has(prereqId)) {
        g.setEdge(prereqId, node.id)
      }
    })
  })

  // The head of a help chain has no prerequisites of its own, and dagre ranks a
  // source at the top of the chart — a local scaffold would read as a foundation
  // of the whole course. Anchor it to whatever its parent already depended on so
  // the cluster lands in the ranks directly above the node it supports.
  nodes.filter(isHelp).forEach(step => {
    if ((step.prerequisiteIds || []).length > 0) return
    const parent = byId.get(step.parentNodeId!)
    if (!parent) return
    ;(parent.prerequisiteIds || [])
      .filter(id => byId.has(id) && !isHelp(byId.get(id)!))
      .forEach(prereqId => g.setEdge(prereqId, step.id))
  })

  // Run layout
  dagre.layout(g)

  const placed = new Map(nodes.map(node => {
    const dagreNode = g.node(node.id)
    return [node.id, {
      x: dagreNode ? Math.round(dagreNode.x) : 480,
      y: dagreNode ? Math.round(dagreNode.y) : 430
    }]
  }))

  // Dagre's ordering pass often leaves a node a handful of pixels off the
  // prerequisite it hangs from — 688 under 698, say. That is invisible as a
  // position and glaring as an edge: the router has to draw a step too small to
  // read as a deliberate turn, and the chart looks like it missed. Pull those
  // into line, but only where the rank still has room, so nothing is nudged on
  // top of a neighbour.
  const SNAP = 24
  const rows = new Map<number, string[]>()
  nodes.forEach(node => {
    const y = placed.get(node.id)!.y
    rows.set(y, [...(rows.get(y) || []), node.id])
  })

  Array.from(rows.keys()).sort((a, b) => a - b).forEach(y => {
    const row = rows.get(y)!.sort((a, b) => placed.get(a)!.x - placed.get(b)!.x)
    row.forEach((id, i) => {
      const here = placed.get(id)!
      const parents = (byId.get(id)!.prerequisiteIds || [])
        .map(prereqId => placed.get(prereqId))
        .filter((p): p is { x: number; y: number } => Boolean(p))
      if (parents.length === 0) return

      const nearest = parents.reduce((best, p) =>
        Math.abs(p.x - here.x) < Math.abs(best.x - here.x) ? p : best)
      if (nearest.x === here.x || Math.abs(nearest.x - here.x) > SNAP) return

      const left = row[i - 1] ? placed.get(row[i - 1])!.x : -Infinity
      const right = row[i + 1] ? placed.get(row[i + 1])!.x : Infinity
      if (nearest.x - left < nodeWidth || right - nearest.x < nodeWidth) return

      here.x = nearest.x
    })
  })

  const layoutNodes = nodes.map(node => ({ ...node, position: placed.get(node.id)! }))

  const maxX = layoutNodes.reduce((m, n) => Math.max(m, n.position.x), 0)
  const maxY = layoutNodes.reduce((m, n) => Math.max(m, n.position.y), 0)
  const minY = layoutNodes.reduce((m, n) => Math.min(m, n.position.y), Infinity)

  const graphInfo = g.graph()
  const graphWidth = Math.max(960, Math.round((graphInfo.width || 960) + 160), maxX + nodeWidth + 80)
  const graphHeight = Math.max(
    860,
    Math.round((graphInfo.height || 860) + 160),
    maxY - Math.min(0, minY) + nodeHeight + 80
  )

  return {
    nodes: layoutNodes,
    width: graphWidth,
    height: graphHeight
  }
}
