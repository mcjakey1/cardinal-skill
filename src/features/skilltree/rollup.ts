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

import { isNodeMastered, missionsForNode, nodeXpEarned, type MissionLike } from './missions.ts';
import type { SkillNode, Tree } from './types';

export interface RollUpInput {
  tree: Tree;
  missions: readonly MissionLike[];
  completedMissionIds: Iterable<string>;
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
  const direct = new Set(input.directlyCompletedIds);
  const server = new Set(input.serverMasteredIds);

  const mastered: string[] = [];
  let localXp = 0;

  for (const node of input.tree.nodes) {
    const own = missionsForNode(input.missions, node.id);

    if (own.length > 0) {
      if (isNodeMastered(input.missions, node.id, done)) mastered.push(node.id);
      // Only count XP the server has not already banked.
      if (!server.has(node.id)) localXp += nodeXpEarned(input.missions, node.id, done);
      continue;
    }

    // No missions: the node's own reward, all or nothing.
    if (server.has(node.id)) {
      mastered.push(node.id);
    } else if (direct.has(node.id)) {
      mastered.push(node.id);
      localXp += node.xpReward;
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
  const own = missionsForNode(missions, node.id);
  if (own.length === 0) return 0;
  const total = own.reduce((sum, m) => sum + m.xpReward, 0);
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, nodeXpEarned(missions, node.id, completedMissionIds) / total));
}
