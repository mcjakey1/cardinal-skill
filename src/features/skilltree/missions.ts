/**
 * Missions are the work a node is made of.
 *
 * A node's XP is not a number someone typed on the node — it is the sum of the
 * missions attached to it. Completing missions is how a student earns their way
 * through a node, and mastering the node is finishing its missions.
 *
 * That makes one rule load-bearing everywhere below: **the node's total never
 * changes**. Asking for extra help re-slices that total across the missions and
 * the new help steps; it does not top the node up, and it does not dock it.
 *
 * Pure and dependency-free, same contract as `progression.ts` — runs in the app,
 * in an Edge Function, and under `node --test`.
 */

import { HELP_SHARE } from './subtree.ts';

export interface MissionLike {
  id: string;
  /** The node this mission belongs to. */
  skillId: string;
  xpReward: number;
}

/** Non-negative integer, or 0. Mission XP comes from the same untrusted places node XP does. */
function clean(xp: number): number {
  return Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
}

/** Every mission belonging to one node, in stable order. */
export function missionsForNode<T extends MissionLike>(missions: readonly T[], nodeId: string): T[] {
  return (missions ?? []).filter((m) => m && m.skillId === nodeId);
}

/**
 * A node's XP: the sum of its missions.
 *
 * A node with no missions is worth 0, and that is the honest answer rather than
 * a fallback to some stored `xpReward` — a node nobody wrote work for has no
 * work in it. Callers that want a placeholder should say so at their own level.
 */
export function nodeXpFromMissions(missions: readonly MissionLike[], nodeId: string): number {
  return missionsForNode(missions, nodeId).reduce((sum, m) => sum + clean(m.xpReward), 0);
}

/** What a student has actually banked on one node. */
export function nodeXpEarned(
  missions: readonly MissionLike[],
  nodeId: string,
  completedMissionIds: Iterable<string>,
): number {
  const done = new Set(completedMissionIds);
  return missionsForNode(missions, nodeId)
    .filter((m) => done.has(m.id))
    .reduce((sum, m) => sum + clean(m.xpReward), 0);
}

/** A node is mastered when every one of its missions is done. A node with no missions is not. */
export function isNodeMastered(
  missions: readonly MissionLike[],
  nodeId: string,
  completedMissionIds: Iterable<string>,
): boolean {
  const own = missionsForNode(missions, nodeId);
  if (own.length === 0) return false;
  const done = new Set(completedMissionIds);
  return own.every((m) => done.has(m.id));
}

export interface MissionFragments {
  /** Same order as the input. */
  missionRewards: number[];
  stepRewards: number[];
}

/**
 * Re-slice a node's total across its missions and `stepCount` help steps.
 *
 * Invariant, and the whole reason this function exists:
 *
 *     sum(missionRewards) + sum(stepRewards) === sum(missionXps)
 *
 * The help steps take `HELP_SHARE` of the node's total; the missions keep the
 * rest, each shrinking in proportion to what it was worth before. So a student
 * who asks for help on a hard node still walks away with exactly the node's
 * XP once they finish everything — they just earn some of it on the scaffold.
 *
 * Integers throughout (`xp_reward` is an integer column). The leftover from the
 * proportional division is handed out one point at a time by largest remainder,
 * so the missions absorb rounding rather than the total drifting.
 */
export function fragmentMissionXp(missionXps: readonly number[], stepCount: number): MissionFragments {
  const missions = (missionXps ?? []).map(clean);
  const total = missions.reduce((a, b) => a + b, 0);
  const steps = Number.isFinite(stepCount) ? Math.floor(stepCount) : 0;

  if (steps <= 0 || total === 0) {
    return { missionRewards: missions, stepRewards: new Array<number>(Math.max(steps, 0)).fill(0) };
  }

  const perStep = Math.floor((total * HELP_SHARE) / steps);
  const stepRewards = new Array<number>(steps).fill(perStep);
  const remaining = total - perStep * steps;

  // Largest-remainder apportionment. Floor everything first, then give the
  // shortfall to whichever missions were rounded down hardest, so the parts sum
  // to `remaining` exactly instead of relying on the rounding to be kind.
  const exact = missions.map((xp) => (xp * remaining) / total);
  const missionRewards = exact.map(Math.floor);
  let shortfall = remaining - missionRewards.reduce((a, b) => a + b, 0);

  const order = exact
    .map((value, i) => ({ i, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; shortfall > 0 && k < order.length; k += 1) {
    const idx = order[k]!.i;
    missionRewards[idx] = (missionRewards[idx] ?? 0) + 1;
    shortfall -= 1;
  }
  // A node whose missions are all worth 0 can still owe the remainder; park it
  // on the first mission so the total is never silently lost.
  if (shortfall > 0 && missionRewards.length > 0) {
    missionRewards[0] = (missionRewards[0] ?? 0) + shortfall;
  }

  return { missionRewards, stepRewards };
}
