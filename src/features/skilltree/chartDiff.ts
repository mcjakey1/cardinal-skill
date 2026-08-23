/**
 * What publish has to write, derived from two graphs rather than from the edit
 * history. The op log drives undo; it never drives publish — replaying ops
 * against a chart that moved underneath is how a draft corrupts a live course.
 *
 * A node missing from the draft is not a delete. Publish never deletes a node,
 * because `node_progress` and `mission_progress` cascade with it. Retirement is
 * the `archived` flag, which arrives as a node that is still present.
 *
 * Pure.
 */

import type { ChartState } from './chartDraft.ts';
import type { Mission, Prereq, SkillNode } from './types.ts';

export interface ChartChangeSet {
  insertNodes: SkillNode[];
  updateNodes: SkillNode[];
  archiveNodes: string[];
  restoreNodes: string[];
  deletePrereqs: Prereq[];
  insertPrereqs: Prereq[];
  upsertMissions: Mission[];
  deleteMissions: string[];
}

const EDITABLE = [
  'title', 'description', 'kind', 'xpReward', 'iconKey', 'x', 'y', 'sortOrder', 'titleOverride',
] as const;

const edgeKey = (p: Prereq) => `${p.nodeId}<-${p.prereqId}`;

function fieldsDiffer(live: SkillNode, draft: SkillNode): boolean {
  return EDITABLE.some(
    (k) => (live as unknown as Record<string, unknown>)[k] !== (draft as unknown as Record<string, unknown>)[k],
  );
}

function missionsDiffer(live: Mission, draft: Mission): boolean {
  return live.title !== draft.title
    || live.description !== draft.description
    || live.kind !== draft.kind
    || live.xpReward !== draft.xpReward
    || live.estimatedMinutes !== draft.estimatedMinutes
    || live.skillId !== draft.skillId;
}

export function diffCharts(live: ChartState, draft: ChartState): ChartChangeSet {
  const liveNodes = new Map(live.nodes.map((n) => [n.id, n]));
  const liveEdges = new Map(live.prereqs.map((p) => [edgeKey(p), p]));
  const liveMissions = new Map(live.missions.map((m) => [m.id, m]));
  const draftEdges = new Map(draft.prereqs.map((p) => [edgeKey(p), p]));
  const draftMissionIds = new Set(draft.missions.map((m) => m.id));

  const set: ChartChangeSet = {
    insertNodes: [], updateNodes: [], archiveNodes: [], restoreNodes: [],
    deletePrereqs: [], insertPrereqs: [], upsertMissions: [], deleteMissions: [],
  };

  for (const node of draft.nodes) {
    const before = liveNodes.get(node.id);
    if (!before) {
      set.insertNodes.push(node);
      continue;
    }
    if (Boolean(before.archived) !== Boolean(node.archived)) {
      (node.archived ? set.archiveNodes : set.restoreNodes).push(node.id);
    }
    if (fieldsDiffer(before, node)) set.updateNodes.push(node);
  }

  for (const [key, edge] of liveEdges) if (!draftEdges.has(key)) set.deletePrereqs.push(edge);
  for (const [key, edge] of draftEdges) if (!liveEdges.has(key)) set.insertPrereqs.push(edge);

  for (const m of draft.missions) {
    const before = liveMissions.get(m.id);
    if (!before || missionsDiffer(before, m)) set.upsertMissions.push(m);
  }
  for (const id of liveMissions.keys()) if (!draftMissionIds.has(id)) set.deleteMissions.push(id);

  return set;
}

export function countChanges(set: ChartChangeSet): number {
  return set.insertNodes.length + set.updateNodes.length + set.archiveNodes.length
    + set.restoreNodes.length + set.deletePrereqs.length + set.insertPrereqs.length
    + set.upsertMissions.length + set.deleteMissions.length;
}

export const isEmptyChangeSet = (set: ChartChangeSet) => countChanges(set) === 0;
