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

import { HELP_SHARE, fragmentXp } from './subtree.ts';

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

/** Local completions add to the server record; local unmarks deliberately override stale server rows. */
export function effectiveMissionCompletionIds(
  serverIds: Iterable<string>,
  localIds: Iterable<string>,
  locallyUnmarkedIds: Iterable<string>,
): string[] {
  const unmarked = new Set(locallyUnmarkedIds);
  return [...new Set([...serverIds, ...localIds])].filter((id) => !unmarked.has(id));
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

/**
 * What a student can do with one mission right now.
 *
 * `locked` is a property of the *node*, not the mission: a node whose
 * prerequisites are unmet locks all of its work, because otherwise finishing
 * missions would be a way to walk around the prerequisite graph.
 */
export type MissionState = 'done' | 'open' | 'locked';

export interface MissionWithState<T extends MissionLike> {
  mission: T;
  state: MissionState;
}

export function missionStates<T extends MissionLike>(
  missions: readonly T[],
  nodeId: string,
  completedMissionIds: Iterable<string>,
  nodeUnlocked: boolean,
): MissionWithState<T>[] {
  const done = new Set(completedMissionIds);
  return missionsForNode(missions, nodeId).map((mission) => ({
    mission,
    state: done.has(mission.id) ? 'done' : nodeUnlocked ? 'open' : 'locked',
  }));
}

/**
 * The one to do next: the first unfinished mission in the node's own order.
 *
 * Syllabus order is the recommendation — a node's missions were written to be
 * done in the order they were written, and nothing here knows better.
 */
export function nextMission<T extends MissionLike>(
  missions: readonly T[],
  nodeId: string,
  completedMissionIds: Iterable<string>,
  nodeUnlocked: boolean,
): T | undefined {
  if (!nodeUnlocked) return undefined;
  const done = new Set(completedMissionIds);
  return missionsForNode(missions, nodeId).find((m) => !done.has(m.id));
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

export interface FragmentationPlan {
  /** What `skill_nodes.xp_reward` becomes on the parent. */
  parentReward: number;
  /** One reward per help step, in the order the steps were given. */
  stepRewards: number[];
  /** New mission rewards in input order, or null when the node has none. */
  missionRewards: number[] | null;
}

/**
 * Everything a "need extra help" request has to re-price, decided in one place.
 *
 * There are two XP splits in this codebase and picking the wrong one is not a
 * rounding bug, it is an XP faucet. `fragmentXp` moves a share of the node's own
 * `xp_reward`; `fragmentMissionXp` moves a share of what the node's missions are
 * worth. Which is correct depends on the node, because a node made of missions
 * pays the student through those missions — dropping its `xp_reward` alone
 * leaves the missions still paying the full original amount while the new steps
 * pay extra on top.
 *
 * So: missions present, re-price the missions; no missions, re-price the node.
 * Either way the invariant `parent + steps === what the node was worth` holds,
 * which is what `request_help_subtree()` re-checks in the database.
 *
 * The mission sum wins over `parentReward` when both exist. `xp_reward` is a
 * cache of that sum and can lag it; conservation has to be measured against the
 * thing the student is actually paid from.
 */
export function planFragmentation(
  parentReward: number,
  missionXps: readonly number[],
  stepCount: number,
): FragmentationPlan {
  if (!missionXps || missionXps.length === 0) {
    const { parentReward: parent, stepRewards } = fragmentXp(parentReward, stepCount);
    return { parentReward: parent, stepRewards, missionRewards: null };
  }

  const { missionRewards, stepRewards } = fragmentMissionXp(missionXps, stepCount);
  return {
    // Kept equal to the missions on purpose: the column is a cache of their sum,
    // and letting the two drift is what makes the chart and the record disagree.
    parentReward: missionRewards.reduce((a, b) => a + b, 0),
    stepRewards,
    missionRewards,
  };
}
