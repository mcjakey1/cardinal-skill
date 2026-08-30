import { supabase } from '@/lib/supabase';

import type { ChartChangeSet } from './chartDiff';
import type { ImpactRow } from './chartImpact';
import { buildPublishPayload } from './publishPayload';

export interface PublishCounts {
  nodesInserted: number;
  nodesUpdated: number;
  nodesArchived: number;
  nodesRestored: number;
  prereqsDeleted: number;
  prereqsInserted: number;
  missionsUpserted: number;
  missionsDeleted: number;
}

/**
 * A missing function is a deployment gap; a failed transaction is a data
 * problem. Only one of those is the instructor's, and they must not read alike.
 *
 * Both RPCs here ship in migration 0015. A project that has not applied it
 * answers PGRST202 with a sentence about the PostgREST schema cache, which is
 * true, unactionable, and reads to an instructor like their publish broke.
 * Everything else is rethrown untouched.
 */
const NEEDS_MIGRATION =
  'This needs a database update that has not been applied to this project yet. '
  + 'Nothing was changed — it is a setup step, not a problem with your chart.';

function failed(error: { code?: string }): never {
  if (error.code === 'PGRST202') throw new Error(NEEDS_MIGRATION);
  throw error;
}

/** Exact per-node counts for the confirm step. Owner-gated in the database. */
export async function fetchArchiveImpact(courseId: string, nodeIds: string[]): Promise<ImpactRow[]> {
  if (nodeIds.length === 0) return [];
  const { data, error } = await supabase.rpc('chart_archive_impact', {
    p_course_id: courseId,
    p_node_ids: nodeIds,
  });
  if (error) failed(error);
  return (data ?? []).map((row: Record<string, number | string>) => ({
    nodeId: String(row.node_id),
    studentsCompleted: Number(row.students_completed),
    missionsHidden: Number(row.missions_hidden),
    missionCompletions: Number(row.mission_completions),
    helpDescendants: Number(row.help_descendants),
  }));
}

/**
 * One call, one transaction. The client cannot run a multi-statement
 * transaction, and a half-applied publish would leave the undo baseline
 * describing a chart that no longer exists.
 */
export async function publishChart(courseId: string, set: ChartChangeSet): Promise<PublishCounts> {
  const { data, error } = await supabase.rpc('publish_chart_changes', {
    p_course_id: courseId,
    p_changes: buildPublishPayload(set),
  });
  if (error) failed(error);
  const row = (Array.isArray(data) ? data[0] : data) ?? {};
  return {
    nodesInserted: Number(row.nodes_inserted ?? 0),
    nodesUpdated: Number(row.nodes_updated ?? 0),
    nodesArchived: Number(row.nodes_archived ?? 0),
    nodesRestored: Number(row.nodes_restored ?? 0),
    prereqsDeleted: Number(row.prereqs_deleted ?? 0),
    prereqsInserted: Number(row.prereqs_inserted ?? 0),
    missionsUpserted: Number(row.missions_upserted ?? 0),
    missionsDeleted: Number(row.missions_deleted ?? 0),
  };
}
