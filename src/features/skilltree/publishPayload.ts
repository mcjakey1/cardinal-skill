/**
 * The JSON `publish_chart_changes` parses.
 *
 * Two rules the database enforces and this file has to respect. `course_id` is
 * never sent for an edge or a mission — the `sync_prereq_course` and
 * `sync_mission_course` triggers overwrite whatever arrives. And
 * `estimated_minutes` has a `> 0` check, so a zero has to become null rather
 * than travel as a zero and fail the insert.
 *
 * Pure, and deliberately in its own file: a test that imports the Supabase
 * client cannot run without credentials, and the whole suite is meant to.
 */

import type { ChartChangeSet } from './chartDiff.ts';
import type { Mission, SkillNode } from './types.ts';

export interface PublishPayload {
  insert_nodes: NodeRow[];
  update_nodes: NodeRow[];
  archive_nodes: { id: string }[];
  restore_nodes: { id: string }[];
  delete_prereqs: EdgeRow[];
  insert_prereqs: EdgeRow[];
  upsert_missions: MissionRow[];
  delete_missions: { id: string }[];
}

interface NodeRow {
  id: string;
  title: string;
  description: string;
  kind: string;
  xp_reward: number;
  icon_key: string | null;
  x: number;
  y: number;
  sort_order: number;
  title_override: string | null;
}

interface EdgeRow { node_id: string; prereq_id: string }

interface MissionRow {
  id: string;
  node_id: string;
  title: string;
  description: string;
  kind: string;
  xp_reward: number;
  estimated_minutes: number | null;
  sort_order: number;
}

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

const nodeRow = (n: SkillNode): NodeRow => ({
  id: n.id,
  title: n.title,
  description: n.description,
  kind: n.kind,
  xp_reward: n.xpReward,
  icon_key: n.iconKey ?? null,
  x: n.x,
  y: n.y,
  sort_order: n.sortOrder,
  title_override: blankToNull(n.titleOverride),
});

const missionRow = (m: Mission, index: number): MissionRow => ({
  id: m.id,
  node_id: m.skillId,
  title: m.title,
  description: m.description,
  kind: m.kind,
  xp_reward: m.xpReward,
  // 0 would fail `check (estimated_minutes > 0)` (0003:29).
  estimated_minutes: m.estimatedMinutes && m.estimatedMinutes > 0 ? m.estimatedMinutes : null,
  sort_order: index,
});

export function buildPublishPayload(set: ChartChangeSet): PublishPayload {
  return {
    insert_nodes: set.insertNodes.map(nodeRow),
    update_nodes: set.updateNodes.map(nodeRow),
    archive_nodes: set.archiveNodes.map((id) => ({ id })),
    restore_nodes: set.restoreNodes.map((id) => ({ id })),
    delete_prereqs: set.deletePrereqs.map((p) => ({ node_id: p.nodeId, prereq_id: p.prereqId })),
    insert_prereqs: set.insertPrereqs.map((p) => ({ node_id: p.nodeId, prereq_id: p.prereqId })),
    upsert_missions: set.upsertMissions.map(missionRow),
    delete_missions: set.deleteMissions.map((id) => ({ id })),
  };
}
