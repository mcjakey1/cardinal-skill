/**
 * Pure progression rules: what's unlocked, what to do next, what level you are.
 *
 * Kept dependency-free and side-effect-free so it runs identically in the app,
 * in an Edge Function, and in `npm test`. Anything that touches the network or
 * the database belongs somewhere else.
 */

import type { NodeStatus, Prereq, SkillNode, Tree } from './types';

/**
 * XP needed to reach level L is XP_PER_LEVEL * (L - 1)^2, so levels get
 * progressively more expensive.
 *
 * ponytail: quadratic curve with one knob. Real pacing has to be tuned against
 * pilot data — a course whose nodes are worth 500 XP will level far faster than
 * one worth 50. Change XP_PER_LEVEL first; only reach for a per-course curve if
 * the pilot shows one constant genuinely can't serve both.
 */
export const XP_PER_LEVEL = 100;

/**
 * One curve for everyone on a course, deliberately.
 *
 * These took a trailing per-learner constant so the adaptive engine could bend
 * the curve per student. Nothing ever passed one, and the two screens that show
 * a level (`app/record.tsx`, `app/tree/[courseId].tsx`) would have had to agree
 * on the same learner's signals to avoid printing two different levels for one
 * student — and `record.tsx` spans every course at once, where per-course
 * signals do not exist. A level also renders beside a leaderboard rank, which
 * only means something if everyone is on one ladder.
 */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / XP_PER_LEVEL)) + 1;
}

export function xpForLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 1) return 0;
  return XP_PER_LEVEL * (level - 1) ** 2;
}

/** Progress toward the next level, 0–1. Drives the level meter. */
export function levelProgress(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  return (xp - floor) / (xpForLevel(level + 1) - floor);
}

/** A normalized part/whole ratio for course and mission meters. */
export function progressRatio(currentXp: number, maxXp: number): number {
  if (!Number.isFinite(currentXp) || !Number.isFinite(maxXp) || maxXp <= 0) return 0;
  return Math.min(Math.max(currentXp / maxXp, 0), 1);
}

export interface StatusResult {
  status: Map<string, NodeStatus>;
  /**
   * Nodes that sit on a prerequisite cycle. They can never unlock, so they are
   * reported rather than silently rendered as permanently locked.
   */
  cyclicNodeIds: string[];
}

/**
 * Derive each node's status from the prerequisite graph and the set of nodes the
 * student has mastered.
 *
 * Trees are AI-generated from an uploaded syllabus, so the prerequisite graph is
 * untrusted input: it can reference nodes that don't exist, and it can contain
 * cycles. Both are handled here rather than at the call sites, because every
 * screen that renders a tree would otherwise need the same guard.
 */
/**
 * The prerequisite edges as the chart reads them, keyed by dependent node.
 *
 * Edges pointing at nodes we don't have are dropped, not treated as unmet. A
 * self-edge is *kept*: a node that requires itself can never unlock, which is a
 * 1-cycle, and `findCyclicNodes` already quarantines those. Dropping it instead
 * would render the node READY while `validateGraph` tells the author the very
 * same chart contains a loop — one chart, two answers, and the student gets the
 * wrong one. Exported so the author-facing `validation.ts` reads the identical
 * graph the student's chart does.
 */
export function prereqsByNode(known: Set<string>, prereqs: readonly Prereq[]): Map<string, string[]> {
  const prereqsOf = new Map<string, string[]>();
  for (const { nodeId, prereqId } of prereqs) {
    if (!known.has(nodeId) || !known.has(prereqId)) continue;
    const list = prereqsOf.get(nodeId);
    if (list) list.push(prereqId);
    else prereqsOf.set(nodeId, [prereqId]);
  }
  return prereqsOf;
}

export function deriveStatuses(tree: Tree, masteredIds: Iterable<string>): StatusResult {
  const known = new Set(tree.nodes.map((n) => n.id));
  const mastered = new Set([...masteredIds].filter((id) => known.has(id)));
  const prereqsOf = prereqsByNode(known, tree.prereqs);

  const cyclic = new Set(findCyclicNodes(known, prereqsOf));

  const status = new Map<string, NodeStatus>();
  for (const node of tree.nodes) {
    if (mastered.has(node.id)) {
      status.set(node.id, 'mastered');
      continue;
    }
    if (cyclic.has(node.id)) {
      status.set(node.id, 'locked');
      continue;
    }
    const unmet = (prereqsOf.get(node.id) ?? []).some((id) => !mastered.has(id));
    status.set(node.id, unmet ? 'locked' : 'available');
  }

  return { status, cyclicNodeIds: [...cyclic] };
}

/**
 * The student's next best moves: unlocked, not yet mastered, in the order the
 * instructor wrote them, with XP breaking a tie.
 *
 * Syllabus order, not cheapest first — the default suggestion follows the
 * course. Cheapest-first is a per-learner judgement and lives behind
 * `rankNextQuests` in `adaptive.ts`, which reads the struggle signals this
 * function deliberately knows nothing about.
 */
export function nextQuests(tree: Tree, masteredIds: Iterable<string>, limit = 3): SkillNode[] {
  const { status } = deriveStatuses(tree, masteredIds);
  return tree.nodes
    .filter((n) => status.get(n.id) === 'available')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.xpReward - b.xpReward)
    .slice(0, limit);
}

/** Total XP a tree is worth. Used for the "N of M" chart completion readout. */
export function totalXp(nodes: SkillNode[]): number {
  return nodes.reduce((sum, n) => sum + n.xpReward, 0);
}

/**
 * Iterative DFS three-colouring; returns every node on or downstream of a cycle.
 *
 * Exported for `validation.ts`, which has to report the same set to the author
 * that the chart shows the student.
 */
export function findCyclicNodes(known: Set<string>, prereqsOf: Map<string, string[]>): string[] {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  const bad = new Set<string>();

  for (const start of known) {
    if (colour.get(start) !== undefined) continue;
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }];
    colour.set(start, GREY);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const edges = prereqsOf.get(frame.id) ?? [];

      if (frame.next >= edges.length) {
        colour.set(frame.id, BLACK);
        stack.pop();
        // A child only becomes known-bad when its own traversal finishes, by
        // which point the parent has already advanced past it and will never
        // look again. Carry the verdict up on the way out, or the reported set
        // silently depends on the order nodes happen to arrive in.
        if (bad.has(frame.id)) {
          const parent = stack[stack.length - 1];
          if (parent) bad.add(parent.id);
        }
        continue;
      }

      const child = edges[frame.next]!;
      frame.next += 1;

      const childColour = colour.get(child) ?? WHITE;
      if (childColour === GREY) {
        // Back edge: everything currently on the stack is on the cycle.
        for (const f of stack) bad.add(f.id);
      } else if (childColour === WHITE) {
        colour.set(child, GREY);
        stack.push({ id: child, next: 0 });
      } else if (bad.has(child)) {
        // Depends on a node that can never unlock, so neither can this one.
        bad.add(frame.id);
      }
    }
  }

  return [...bad];
}

export interface SkillEligibilityPrereqInfo {
  id: string;
  title: string;
  isMastered: boolean;
}

export interface SkillEligibility {
  isUnlocked: boolean;
  completedPrerequisites: SkillEligibilityPrereqInfo[];
  incompletePrerequisites: SkillEligibilityPrereqInfo[];
  totalPrerequisites: number;
  nextRecommendedPrerequisiteId: string | null;
  blockedReason: string | null;
}

export function evaluateSkillUnlockState(
  skillId: string,
  tree: Tree,
  masteredIds: Iterable<string>
): SkillEligibility {
  // The detail panel opens from a cell the chart already drew, so the verdict
  // has to come from the same place that cell's did. Reading `tree.prereqs`
  // straight skips the sanitisation `deriveStatuses` performs, and the panel
  // then calls a node LOCKED while the cell behind it reads READY.
  const { status, cyclicNodeIds } = deriveStatuses(tree, masteredIds);
  const titleById = new Map(tree.nodes.map((n) => [n.id, n.title]));
  const masteredSet = new Set([...masteredIds].filter((id) => titleById.has(id)));
  const prereqIds = prereqsByNode(new Set(titleById.keys()), tree.prereqs).get(skillId) ?? [];

  const completedPrerequisites: SkillEligibilityPrereqInfo[] = [];
  const incompletePrerequisites: SkillEligibilityPrereqInfo[] = [];

  for (const pid of prereqIds) {
    const isMastered = masteredSet.has(pid);
    const info = { id: pid, title: titleById.get(pid) ?? pid, isMastered };
    if (isMastered) {
      completedPrerequisites.push(info);
    } else {
      incompletePrerequisites.push(info);
    }
  }

  const totalPrerequisites = prereqIds.length;
  const isUnlocked = status.get(skillId) !== 'locked';
  const nextRecommendedPrerequisiteId = incompletePrerequisites[0]?.id ?? null;
  // A node on a loop is not waiting on a count that will ever reach zero, so
  // saying "N remaining" there is advice the student cannot act on.
  const blockedReason = isUnlocked
    ? null
    : cyclicNodeIds.includes(skillId)
      ? 'This skill sits in a prerequisite loop, so it cannot be unlocked. Ask your instructor to fix the chart.'
      : `This skill unlocks after you master ${incompletePrerequisites.length} remaining prerequisite${incompletePrerequisites.length > 1 ? 's' : ''}.`;

  return {
    isUnlocked,
    completedPrerequisites,
    incompletePrerequisites,
    totalPrerequisites,
    nextRecommendedPrerequisiteId,
    blockedReason,
  };
}

export function getSkillEligibility(
  skillId: string,
  tree: Tree,
  masteredIds: Iterable<string>
): SkillEligibility {
  return evaluateSkillUnlockState(skillId, tree, masteredIds);
}

/** Convenience for tests and for building a tree from flat query rows. */
export function buildTree(nodes: SkillNode[], prereqs: Prereq[]): Tree {
  return { nodes, prereqs };
}

