export interface CourseGraphNode {
  key: string;
  prereq_keys: string[];
}

export interface TieredCourseGraphNode extends CourseGraphNode {
  tier: number;
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

/** Validate a four-tier graph without inventing academic prerequisites. */
export function validateTieredCourseDag<T extends TieredCourseGraphNode>(nodes: readonly T[]): T[] {
  const ordered = nodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) => left.node.tier - right.node.tier || left.index - right.index)
    .map(({ node }) => ({
      ...node,
      prereq_keys: [...new Set(Array.isArray(node.prereq_keys) ? node.prereq_keys : [])],
    }));
  const byKey = new Map(ordered.map((node) => [node.key, node]));
  const indexByKey = new Map(ordered.map((node, index) => [node.key, index]));
  const tiers = new Set<number>();

  for (const node of ordered) {
    if (!Number.isInteger(node.tier) || node.tier < 1 || node.tier > 4) {
      throw new Error(`${node.key} must use a tier from 1 to 4.`);
    }
    tiers.add(node.tier);
    for (const parentKey of node.prereq_keys) {
      const parent = byKey.get(parentKey);
      if (!parent) throw new Error(`${node.key} references an unknown prerequisite (${parentKey}).`);
      if (parent.tier > node.tier) {
        throw new Error(`${parentKey} -> ${node.key} moves backward from Tier ${parent.tier} to Tier ${node.tier}.`);
      }
      if ((indexByKey.get(parentKey) ?? Infinity) >= (indexByKey.get(node.key) ?? -1)) {
        throw new Error(`${parentKey} -> ${node.key} must point forward within its tier.`);
      }
    }
  }

  for (let tier = 1; tier <= 4; tier += 1) {
    if (!tiers.has(tier)) throw new Error(`The course graph is missing Tier ${tier}.`);
  }

  const reduced = removeTransitivePrerequisites(ordered);
  for (const node of reduced) {
    if (node.tier === 1 && node.prereq_keys.length > 0) {
      throw new Error(`${node.key} is a Tier 1 root and cannot have prerequisites.`);
    }
    if (node.tier > 1 && node.prereq_keys.length === 0) {
      throw new Error(`${node.key} is an orphan; every Tier 2–4 skill needs a prerequisite.`);
    }
  }

  const adjacency = buildAdjacency(reduced);
  if (reduced.length > 0 && flood(reduced[0]!.key, adjacency).size !== reduced.length) {
    throw new Error('The course topics form multiple disconnected skill trees.');
  }
  return reduced;
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
