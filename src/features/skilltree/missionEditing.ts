import type { TreeSnapshot } from './queries';
import type { Mission, MissionDifficulty } from './types';

export type MissionDraft = Omit<Mission, 'xpReward'> & { xpReward: string };

export interface MissionUpdate {
  id: string;
  skillId: string;
  title: string;
  description: string;
  xpReward: number;
  estimatedMinutes: number;
  difficulty: MissionDifficulty;
}

export function applyMissionUpdate(snapshot: TreeSnapshot, update: MissionUpdate): TreeSnapshot {
  const missions = snapshot.missions.map((mission) =>
    mission.id === update.id ? { ...mission, ...update } : mission,
  );
  const nodeXp = missions
    .filter((mission) => mission.skillId === update.skillId)
    .reduce((total, mission) => total + mission.xpReward, 0);
  return {
    ...snapshot,
    missions,
    tree: {
      ...snapshot.tree,
      nodes: snapshot.tree.nodes.map((node) =>
        node.id === update.skillId ? { ...node, xpReward: nodeXp } : node,
      ),
    },
  };
}

export function toMissionDrafts(missions: readonly Mission[]): MissionDraft[] {
  return missions.map((mission) => ({ ...mission, xpReward: String(mission.xpReward) }));
}

export function parseMissionXp(value: string): number {
  return Math.max(0, Math.min(10000, Number.parseInt(value, 10) || 0));
}

export function missionDraftTotal(missions: readonly MissionDraft[]): number {
  return missions.reduce((total, mission) => total + parseMissionXp(mission.xpReward), 0);
}

export function finalizeMissionDrafts(missions: readonly MissionDraft[]): Mission[] {
  return missions.map((mission) => ({
    ...mission,
    title: mission.title.trim() || 'Untitled mission',
    xpReward: parseMissionXp(mission.xpReward),
  }));
}
