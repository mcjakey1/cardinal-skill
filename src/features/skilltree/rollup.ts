/**
 * Fold missions, direct completions, and whatever the server already knows into
 * one answer: what is mastered, and what is it worth.
 *
 * Two ways a node gets mastered, and the order matters:
 *
 * 1. Every one of its missions is done. This is the normal path.
 * 2. It was marked complete directly. Only nodes with no missions can take this
 *    path — a node made of work is finished by doing the work, not by asserting
 *    it is finished.
 *
 * XP accrues per mission rather than in a lump at the end, so a student who has
 * done half a node can see half its XP. That is the whole reason missions exist.
 *
 * Pure and dependency-free, same contract as `progression.ts`.
 */

import {
  cleanXp,
  isNodeMastered,
  missionsForNode,
  nodeXpFromMissions,
  nodeXpEarned,
  type MissionLike,
} from './missions.ts';
import type { SkillNode, Tree } from './types';

export interface RollUpInput {
  tree: Tree;
  missions: readonly MissionLike[];
  completedMissionIds: Iterable<string>;
  /** Missions already included in serverXp. Excluded from the offline delta. */
  serverCompletedMissionIds: Iterable<string>;
  /** Nodes marked complete outright. Only honoured for nodes with no missions. */
  directlyCompletedIds: Iterable<string>;
  /** What the backend already recorded, if there is one. */
  serverMasteredIds: Iterable<string>;
  serverXp: number;
}

export interface RollUp {
  masteredIds: string[];
  xp: number;
  completedMissionIds: string[];
}

export function rollUpProgress(input: RollUpInput): RollUp {
  const done = new Set(input.completedMissionIds);
  const serverDone = new Set(input.serverCompletedMissionIds);
  const direct = new Set(input.directlyCompletedIds);
  const server = new Set(input.serverMasteredIds);

  // serverXp already carries immutable completion-time snapshots, so only
  // locally queued missions belong in the optimistic delta.
  const localOnly = [...done].filter((id) => !serverDone.has(id));

  const mastered: string[] = [];
  let localXp = 0;

  for (const node of input.tree.nodes) {
    const own = missionsForNode(input.missions, node.id);

    if (own.length > 0) {
      if (isNodeMastered(input.missions, node.id, done)) mastered.push(node.id);
      // Through `nodeXpEarned` rather than summing raw rewards, so the headline
      // number gets the same normalisation every other reader of a mission
      // reward gets. One absurd value out of the parser would otherwise reach
      // `levelForXp` and the level meter as NaN.
      localXp += nodeXpEarned(input.missions, node.id, localOnly);
      continue;
    }

    // No missions: the node's own reward, all or nothing.
    if (server.has(node.id)) {
      mastered.push(node.id);
    } else if (direct.has(node.id)) {
      mastered.push(node.id);
      localXp += cleanXp(node.xpReward);
    }
  }

  return {
    masteredIds: mastered,
    xp: input.serverXp + localXp,
    completedMissionIds: [...done],
  };
}

/** Progress into one node, 0–1. Drives the meter on a node that is part-done. */
export function nodeProgress(
  node: SkillNode,
  missions: readonly MissionLike[],
  completedMissionIds: Iterable<string>,
  mastered: boolean,
): number {
  if (mastered) return 1;
  if (missionsForNode(missions, node.id).length === 0) return 0;
  // Both halves of the ratio are cleaned, or a fractional reward divides a
  // floored numerator by an unfloored total and the meter reads 0.467 for half.
  const total = nodeXpFromMissions(missions, node.id);
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, nodeXpEarned(missions, node.id, completedMissionIds) / total));
}

