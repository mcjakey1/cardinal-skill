export interface CourseGraphNode {
  key: string;
  prereq_keys: string[];
}

export interface TieredCourseGraphNode extends CourseGraphNode {
  tier: number;
}

export interface SemanticTieredCourseGraphNode extends TieredCourseGraphNode {
  title: unknown;
  description?: unknown;
}

export interface CourseGraphTopology {
  forks: number;
  convergences: number;
  longestPath: number;
}

/**
 * Reject a semester graph that is valid as a DAG but still behaves like a
 * week-by-week checklist. Small workshops may genuinely be sequential; larger
 * curricula need both branching and supported convergence to work as a tree.
 */
export function requirePedagogicalCourseGraph<T extends CourseGraphNode>(
  nodes: readonly T[],
): readonly T[] {
  if (nodes.length < 10) return nodes;

  const topology = courseGraphTopology(nodes);
  const minForks = nodes.length >= 16 ? 2 : 1;
  // One genuine merge is enough. Requiring several across every discipline
  // makes the repair model invent relationships between otherwise independent
  // branches; forks and longest-path limits already reject a disguised chain.
  const minConvergences = 1;
  const maxLongestPath = Math.max(6, Math.ceil(nodes.length * (nodes.length >= 16 ? 0.7 : 0.8)));

  if (
    topology.forks < minForks
    || topology.convergences < minConvergences
    || topology.longestPath > maxLongestPath
  ) {
    const convergenceLabel = `${minConvergences} multi-prerequisite convergence${minConvergences === 1 ? '' : 's'}`;
    throw new Error(
      `The graph is too linear for a skill tree: ${nodes.length} skills require at least ${minForks} branch points, ${convergenceLabel}, and a longest prerequisite path of at most ${maxLongestPath} skills; the graph returned ${topology.forks}, ${topology.convergences}, and ${topology.longestPath}. Rewire existing competencies by conceptual dependency; syllabus week order alone is not a prerequisite.`,
    );
  }

  return nodes;
}

export function courseGraphTopology(nodes: readonly CourseGraphNode[]): CourseGraphTopology {
  const knownKeys = new Set(nodes.map((node) => node.key));
  const unlockCount = new Map(nodes.map((node) => [node.key, 0]));
  const longestPathByKey = new Map<string, number>();

  for (const node of nodes) {
    const prerequisites = [...new Set(node.prereq_keys)].filter((key) => knownKeys.has(key));
    for (const prerequisite of prerequisites) {
      unlockCount.set(prerequisite, (unlockCount.get(prerequisite) ?? 0) + 1);
    }
    longestPathByKey.set(
      node.key,
      1 + prerequisites.reduce(
        (longest, prerequisite) => Math.max(longest, longestPathByKey.get(prerequisite) ?? 0),
        0,
      ),
    );
  }

  return {
    forks: [...unlockCount.values()].filter((count) => count >= 2).length,
    convergences: nodes.filter((node) =>
      new Set(node.prereq_keys.filter((key) => knownKeys.has(key))).size >= 2
    ).length,
    longestPath: Math.max(0, ...longestPathByKey.values()),
  };
}

/**
 * A named synthesis/capstone is a convergence, never an early prerequisite.
 * Put it after the academic tracks and make every non-synthesis terminal feed
 * it. This repairs a common model inversion without guessing that every hard
 * or Tier 4 topic is cumulative.
 */
export function placeSynthesisAtCourseEnd<T extends SemanticTieredCourseGraphNode>(
  nodes: readonly T[],
): T[] {
  const finalSynthesisIndex = nodes.findLastIndex(isSynthesisNode);
  if (finalSynthesisIndex < 0) {
    return nodes.map((node) => ({ ...node, prereq_keys: [...node.prereq_keys] }));
  }

  // Models sometimes label several track-level integrations as "Synthesis".
  // Making every one depend on every terminal creates a dense parallel comb.
  // The provider orders the genuine course-wide convergence last, so only that
  // node closes the whole graph; earlier integrations retain their own track.
  const finalSynthesis = nodes[finalSynthesisIndex]!;

  const ordinary = nodes
    .filter((_, index) => index !== finalSynthesisIndex)
    .map((node) => ({
      ...node,
      prereq_keys: node.prereq_keys.filter((key) => key !== finalSynthesis.key),
    }));
  const ordinaryKeys = new Set(ordinary.map((node) => node.key));
  const unlocksOrdinary = new Set<string>();
  for (const node of ordinary) {
    for (const prerequisite of node.prereq_keys) {
      if (ordinaryKeys.has(prerequisite)) unlocksOrdinary.add(prerequisite);
    }
  }
  const terminalKeys = ordinary
    .filter((node) => !unlocksOrdinary.has(node.key))
    .map((node) => node.key);

  return [...ordinary, {
    ...finalSynthesis,
    tier: 4,
    prereq_keys: [...terminalKeys],
  }];
}

function isSynthesisNode(node: SemanticTieredCourseGraphNode): boolean {
  const content = `${typeof node.title === 'string' ? node.title : ''} ${
    typeof node.description === 'string' ? node.description : ''
  }`.toLowerCase();
  return /\b(?:synthesis|capstone)\b|\b(?:comprehensive|cumulative|integrative)\s+(?:course\s+)?(?:review|assessment|project)\b/.test(content);
}

/**
 * Repair recoverable model topology mistakes before persistence.
 *
 * Node order is the source of truth: it makes the graph acyclic, lets the
 * connected-DAG repair join fragments, and gives every repaired edge a stable
 * direction. Tier labels are then reconciled with the actual prerequisites.
 */
export function normalizeTieredCourseDag<T extends TieredCourseGraphNode>(nodes: readonly T[]): T[] {
  const connected = ensureSingleCourseDag(nodes);
  const normalizedTierByKey = new Map<string, number>();

  return connected.map((node) => {
    const parentTier = node.prereq_keys.reduce(
      (highest, key) => Math.max(highest, normalizedTierByKey.get(key) ?? 1),
      1,
    );
    const requestedTier = Math.max(1, Math.min(4, Math.round(Number(node.tier) || 1)));
    const tier = node.prereq_keys.length === 0
      ? 1
      : Math.max(2, Math.min(4, Math.max(requestedTier, parentTier)));
    normalizedTierByKey.set(node.key, tier);
    return { ...node, tier };
  });
}

/**
 * Coerce untrusted parser output into one connected prerequisite DAG.
 *
 * Edges may only point to an earlier node. That single ordering rule removes
 * dangling references, self-links, and cycles. Components are then joined at
 * their earliest root so one syllabus always produces one navigable graph.
 */
export function ensureSingleCourseDag<T extends CourseGraphNode>(nodes: readonly T[]): T[] {
  const indexByKey = new Map(nodes.map((node, index) => [node.key, index]));
  const normalized = nodes.map((node, index) => ({
    ...node,
    prereq_keys: [...new Set(Array.isArray(node.prereq_keys) ? node.prereq_keys : [])]
      .filter((key) => (indexByKey.get(key) ?? index) < index),
  }));

  if (normalized.length < 2) return normalized;

  const adjacency = buildAdjacency(normalized);
  const connected = flood(normalized[0]!.key, adjacency);

  while (connected.size < normalized.length) {
    const rootIndex = normalized.findIndex((node) => !connected.has(node.key));
    if (rootIndex <= 0) break;

    const root = normalized[rootIndex]!;
    const parent = normalized[rootIndex - 1]!;
    root.prereq_keys = [...new Set([...root.prereq_keys, parent.key])];

    const component = flood(root.key, adjacency);
    adjacency.get(root.key)!.add(parent.key);
    adjacency.get(parent.key)!.add(root.key);
    connected.add(parent.key);
    for (const key of component) connected.add(key);
  }

  return removeTransitivePrerequisites(normalized);
}

/** Remove A -> C when A already reaches C through another direct prerequisite. */
export function removeTransitivePrerequisites<T extends CourseGraphNode>(nodes: T[]): T[] {
  const ancestors = new Map<string, Set<string>>();
  for (const node of nodes) {
    const direct = node.prereq_keys;
    node.prereq_keys = direct.filter((parent) =>
      !direct.some((other) => other !== parent && ancestors.get(other)?.has(parent))
    );

    const inherited = new Set<string>();
    for (const parent of node.prereq_keys) {
      inherited.add(parent);
      for (const ancestor of ancestors.get(parent) ?? []) inherited.add(ancestor);
    }
    ancestors.set(node.key, inherited);
  }
  return nodes;
}

function buildAdjacency(nodes: readonly CourseGraphNode[]): Map<string, Set<string>> {
  const adjacency = new Map(nodes.map((node) => [node.key, new Set<string>()]));
  for (const node of nodes) {
    for (const parent of node.prereq_keys) {
      adjacency.get(node.key)?.add(parent);
      adjacency.get(parent)?.add(node.key);
    }
  }
  return adjacency;
}

function flood(start: string, adjacency: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const visited = new Set<string>();
  const pending = [start];
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const next of adjacency.get(key) ?? []) {
      if (!visited.has(next)) pending.push(next);
    }
  }
  return visited;
}
