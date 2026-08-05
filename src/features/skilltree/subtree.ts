/**
 * Help subtrees: the supplemental steps inserted under a node a student is
 * stuck on, plus the XP arithmetic that stops "need extra help" from becoming
 * an XP faucet.
 *
 * Pure and dependency-free, same contract as `progression.ts` — it runs in the
 * app, in an Edge Function, and under `node --test`.
 */

import type { HelpStep, Prereq, SkillNode, Tree } from './types';

/**
 * Fraction of a parent's reward that moves down to its help steps.
 *
 * ponytail: one global constant, not a per-course or per-kind table. This is
 * the calibration knob and it needs pilot data — too low and the scaffold feels
 * unrewarded, too high and finishing the real node is an anticlimax. Tune this
 * number against real students before giving the formula a second dimension.
 */
export const HELP_SHARE = 0.4;

export interface XpFragments {
  parentReward: number;
  stepRewards: number[];
}

/**
 * Split a node's reward between the node and `stepCount` help steps.
 *
 * Invariant, and the entire point of the function:
 *
 *     result.parentReward + sum(result.stepRewards) === parentReward
 *
 * Requesting help *redistributes* XP, it never mints it. Without that, a
 * student farms levels by pressing "need extra help" on every node and the
 * level meter stops meaning anything.
 *
 * Everything is an integer (`xp_reward` is an integer column with a
 * `between 0 and 10000` check) and the rounding remainder is left on the
 * parent, so fragmenting the same node repeatedly can never bleed XP into the
 * steps or out of the course.
 */
export function fragmentXp(parentReward: number, stepCount: number): XpFragments {
  // `xp_reward` is a non-negative integer in the database. Anything else is a
  // caller bug or bad AI output; normalising here is what keeps NaN and
  // negative rewards out of the rest of the system.
  const total = Number.isFinite(parentReward) && parentReward > 0 ? Math.floor(parentReward) : 0;
  const steps = Number.isFinite(stepCount) ? Math.floor(stepCount) : 0;
  if (steps <= 0) return { parentReward: total, stepRewards: [] };

  const perStep = Math.floor((total * HELP_SHARE) / steps);
  return {
    parentReward: total - perStep * steps,
    stepRewards: new Array<number>(steps).fill(perStep),
  };
}

export interface HelpSubtree {
  nodes: SkillNode[];
  prereqs: Prereq[];
  /** Apply to the parent row in the same transaction that inserts `nodes`. */
  parentPatch: { id: string; xpReward: number };
}

/**
 * Where a help step sits relative to the node it scaffolds. Prerequisites flow
 * left to right on the chart, so the steps go to the left and stack downward.
 *
 * ponytail: two constants, no collision check against the rest of the chart.
 * The steps will not land on their own parent or on each other, which is the
 * bug that matters; they can still overlap an unrelated node. A real layout
 * pass (re-flow the affected column) can come when a pilot tree actually looks
 * crowded.
 */
const HELP_DX = -70;
const HELP_DY = 90;

/**
 * Build the supplemental nodes and edges for one "need extra help" request.
 *
 * `mintId` is passed in rather than generated here so this stays pure and
 * testable: the caller hands over `crypto.randomUUID` in the app and a counter
 * in a test.
 */
export function buildHelpSubtree(
  parent: SkillNode,
  steps: HelpStep[],
  mintId: (key: string) => string,
): HelpSubtree {
  // Steps come from the model, so they are untrusted: keys can be blank,
  // repeated, or absent. Keep the first occurrence of each usable key; a
  // duplicate would otherwise mint two ids for one key and make the edge
  // translation ambiguous.
  const usable: HelpStep[] = [];
  const idByKey = new Map<string, string>();
  for (const step of steps ?? []) {
    if (!step || typeof step.key !== 'string' || step.key === '' || idByKey.has(step.key)) continue;
    idByKey.set(step.key, mintId(step.key));
    usable.push(step);
  }
  const indexByKey = new Map(usable.map((step, i) => [step.key, i] as const));

  const { parentReward, stepRewards } = fragmentXp(parent.xpReward, usable.length);

  const nodes: SkillNode[] = [];
  const prereqs: Prereq[] = [];
  const isPrereqOfAStep = new Set<string>();

  for (const [i, step] of usable.entries()) {
    const id = idByKey.get(step.key)!;

    // A step may only require a step declared *earlier* in the same batch.
    // That one rule makes the subtree acyclic by construction — every edge
    // points backwards in array order, so no cycle can exist — which is why
    // there is no cycle detection here. Self, forward, and unknown references
    // are dropped rather than handed to `deriveStatuses`, because a node it
    // quarantines as cyclic renders as permanently locked, and a permanently
    // locked dead end is the worst possible thing to show a student who just
    // asked for help.
    for (const key of step.prereqKeys ?? []) {
      const j = indexByKey.get(key);
      if (j === undefined || j >= i) continue;
      prereqs.push({ nodeId: id, prereqId: idByKey.get(key)! });
      isPrereqOfAStep.add(key);
    }

    nodes.push({
      id,
      courseId: parent.courseId,
      trackId: parent.trackId,
      title: step.title,
      description: step.description,
      kind: step.kind,
      xpReward: stepRewards[i] ?? 0,
      estimatedMinutes: step.estimatedMinutes,
      x: parent.x + HELP_DX,
      y: parent.y + HELP_DY * (i + 1),
      // `sort_order` is an integer column, so the steps cannot be interleaved
      // fractionally ahead of the parent. They share the parent's slot and
      // their lower reward sorts them first; the prereq chain below is what
      // actually enforces the order.
      sortOrder: parent.sortOrder,
      parentNodeId: parent.id,
      graded: false,
    });
  }

  // Terminal steps — the ones nothing else in the batch depends on — become
  // prerequisites of the parent. Without this the scaffold is decorative: the
  // student could skip every step and the node they were stuck on is unchanged.
  for (const step of usable) {
    if (isPrereqOfAStep.has(step.key)) continue;
    prereqs.push({ nodeId: parent.id, prereqId: idByKey.get(step.key)! });
  }

  return { nodes, prereqs, parentPatch: { id: parent.id, xpReward: parentReward } };
}

export interface XpTally {
  earned: number;
  available: number;
}

export interface XpBreakdown {
  earned: number;
  available: number;
  graded: XpTally;
  supplemental: XpTally;
}

/**
 * "N of M XP", split so the meter stays honest once help subtrees exist.
 *
 * The two halves are reported separately because they mean different things:
 * `graded` is what the course is worth, `supplemental` is scaffold XP that was
 * carved out of it. A single total would hide the fact that a student with
 * many help subtrees has the same ceiling as one with none — which is exactly
 * the property `fragmentXp` exists to guarantee.
 */
export function xpBreakdown(tree: Tree, masteredIds: Iterable<string>): XpBreakdown {
  const mastered = new Set(masteredIds);
  const graded: XpTally = { earned: 0, available: 0 };
  const supplemental: XpTally = { earned: 0, available: 0 };

  for (const node of tree.nodes) {
    // `graded` is undefined on every node written before help subtrees existed,
    // and all of those came from a syllabus. Only an explicit `false` is
    // supplemental.
    const tally = node.graded === false ? supplemental : graded;
    const xp = Number.isFinite(node.xpReward) && node.xpReward > 0 ? node.xpReward : 0;
    tally.available += xp;
    if (mastered.has(node.id)) tally.earned += xp;
  }

  return {
    earned: graded.earned + supplemental.earned,
    available: graded.available + supplemental.available,
    graded,
    supplemental,
  };
}
