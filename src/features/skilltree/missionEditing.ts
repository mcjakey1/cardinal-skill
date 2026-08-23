import type { Mission } from './types';

export type MissionDraft = Omit<Mission, 'xpReward'> & { xpReward: string };

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
