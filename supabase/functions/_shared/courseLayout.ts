export interface CourseLayoutNode {
  key: string;
  prereq_keys: readonly string[];
}

export interface CourseLayoutConfig {
  /** Centre-to-centre distance between prerequisite ranks, in tree units. */
  rankSep: number;
  /** Centre-to-centre distance between siblings in one rank, in tree units. */
  nodeSep: number;
}

export const DEFAULT_COURSE_LAYOUT: CourseLayoutConfig = {
  rankSep: 232,
  nodeSep: 112,
};

export type PositionedCourseNode<T> = T & {
  x: number;
  y: number;
  sort_order: number;
};

/**
 * Lay out a normalized prerequisite DAG as compact, centred left-to-right ranks.
 *
 * The parser already orders every prerequisite before its child. Re-check that
 * boundary here because AI output remains untrusted, then use parent barycentres
 * to keep conceptual branches adjacent. Explicit ranks prevent a layout engine
 * from pushing later roots halfway across the chart merely to shorten an edge.
 */
export function layoutCourseGraph<T extends CourseLayoutNode>(
  nodes: readonly T[],
  config: CourseLayoutConfig = DEFAULT_COURSE_LAYOUT,
): Array<PositionedCourseNode<T>> {
  if (nodes.length === 0) return [];

  const indexByKey = new Map(nodes.map((node, index) => [node.key, index]));
  const rankByKey = new Map<string, number>();
  const parentsByKey = new Map<string, string[]>();

  nodes.forEach((node, index) => {
    const parents = [...new Set(node.prereq_keys)]
      .filter((key) => (indexByKey.get(key) ?? index) < index);
    parentsByKey.set(node.key, parents);
    const rank = parents.length === 0
      ? 0
      : Math.max(...parents.map((key) => rankByKey.get(key) ?? 0)) + 1;
    rankByKey.set(node.key, rank);
  });

  const ranks = new Map<number, T[]>();
  for (const node of nodes) {
    const rank = rankByKey.get(node.key) ?? 0;
    ranks.set(rank, [...(ranks.get(rank) ?? []), node]);
  }

  const rowByKey = new Map<string, number>();
  const maxRank = Math.max(...rankByKey.values());
  for (let rank = 0; rank <= maxRank; rank += 1) {
    const column = ranks.get(rank) ?? [];
    if (rank > 0) {
      column.sort((left, right) => {
        const leftCentre = parentCentre(parentsByKey.get(left.key) ?? [], rowByKey);
        const rightCentre = parentCentre(parentsByKey.get(right.key) ?? [], rowByKey);
        return leftCentre - rightCentre
          || indexByKey.get(left.key)! - indexByKey.get(right.key)!;
      });
    }
    column.forEach((node, row) => rowByKey.set(node.key, row));
  }

  const rawY = new Map<string, number>();
  let minY = 0;
  for (const column of ranks.values()) {
    const centre = (column.length - 1) / 2;
    column.forEach((node, row) => {
      const y = (row - centre) * config.nodeSep;
      rawY.set(node.key, y);
      minY = Math.min(minY, y);
    });
  }

  return nodes.map((node, sort_order) => ({
    ...node,
    x: (rankByKey.get(node.key) ?? 0) * config.rankSep,
    y: (rawY.get(node.key) ?? 0) - minY,
    sort_order,
  }));
}

function parentCentre(parents: readonly string[], rowByKey: ReadonlyMap<string, number>): number {
  if (parents.length === 0) return Number.POSITIVE_INFINITY;
  return parents.reduce((sum, key) => sum + (rowByKey.get(key) ?? 0), 0) / parents.length;
}
