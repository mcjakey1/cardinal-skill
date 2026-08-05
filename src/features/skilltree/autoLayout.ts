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

export const DEFAULT_LAYOUT: LayoutConfig = { rankSep: 150, nodeSep: 90 };

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
