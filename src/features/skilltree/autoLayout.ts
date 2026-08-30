/**
 * Assign chart coordinates to a graph that has none.
 *
 * Nodes arrive from the syllabus parser or an instructor's authoring session
 * with no positions, and the chart cannot draw what it cannot place. The web
 * prototype reached for dagre; this does the same job in a few dozen lines with
 * no dependency, which matters because the layout has to run on a phone.
 *
 * Pure and dependency-free, same contract as `progression.ts`.
 */

import type { Prereq, SkillNode } from './types';

export interface LayoutConfig {
  /** Horizontal gap between one rank and the next. */
  rankSep: number;
  /** Vertical gap between two nodes sharing a rank. */
  nodeSep: number;
}

export const DEFAULT_LAYOUT: LayoutConfig = { rankSep: 210, nodeSep: 120 };

export interface NodeFootprint {
  /** Minimum horizontal centre-to-centre distance in tree coordinates. */
  width: number;
  /** Minimum vertical centre-to-centre distance in tree coordinates. */
  height: number;
}

/** The chart's 132dp label and cell stack converted back to tree coordinates. */
export const DEFAULT_NODE_FOOTPRINT: NodeFootprint = { width: 148, height: 80 };

/** Whether two finite node footprints occupy the same rendered space. */
export function hasOverlappingNodePositions(
  nodes: readonly Pick<SkillNode, 'x' | 'y'>[],
  footprint: NodeFootprint = DEFAULT_NODE_FOOTPRINT,
): boolean {
  for (let left = 0; left < nodes.length; left += 1) {
    const a = nodes[left]!;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return true;
    for (let right = left + 1; right < nodes.length; right += 1) {
      const b = nodes[right]!;
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return true;
      if (Math.abs(a.x - b.x) < footprint.width && Math.abs(a.y - b.y) < footprint.height) {
        return true;
      }
    }
  }
  return false;
}

export interface LayoutResult {
  nodes: SkillNode[];
}

/**
 * Rank each node one step beyond its deepest prerequisite, then read the rank
 * off as an x coordinate.
 *
 * Relaxation is bounded by the node count rather than following edges to
 * exhaustion: the graph is untrusted AI output and may contain a cycle, and a
 * bounded pass settles every acyclic node correctly while refusing to hang on
 * the rest.
 */
export function autoLayout(
  nodes: SkillNode[],
  prereqs: Prereq[],
  config: LayoutConfig = DEFAULT_LAYOUT,
): LayoutResult {
  const known = new Set(nodes.map((n) => n.id));
  const edges = prereqs.filter((p) => known.has(p.nodeId) && known.has(p.prereqId));

  const rank = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let moved = false;
    for (const { nodeId, prereqId } of edges) {
      const want = rank.get(prereqId)! + 1;
      if (want > rank.get(nodeId)!) {
        rank.set(nodeId, want);
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Stack each rank in the order the nodes arrived, so a syllabus that lists
  // two topics in a sensible order keeps that order down the column.
  const takenInRank = new Map<number, number>();

  return {
    nodes: nodes.map((n) => {
      const r = rank.get(n.id)!;
      const row = takenInRank.get(r) ?? 0;
      takenInRank.set(r, row + 1);
      return { ...n, x: r * config.rankSep, y: row * config.nodeSep };
    }),
  };
}
