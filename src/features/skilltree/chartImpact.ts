/**
 * What a publish will actually do to students, for the confirm step.
 *
 * The counts come from `chart_archive_impact`, which has no five-student
 * suppression floor — unlike `course_progress_summary`, which keeps its floor
 * because Class insights is built on it. This readout is a pre-flight check on
 * a destructive action by the owner of the data, which is a different question
 * from a published class statistic.
 *
 * Pure. The rows arrive as an argument.
 */

import type { ChartState } from './chartDraft.ts';
import type { ChartChangeSet } from './chartDiff.ts';

/** Exactly the shape `chart_archive_impact` returns, one row per node. */
export interface ImpactRow {
  nodeId: string;
  studentsCompleted: number;
  missionsHidden: number;
  missionCompletions: number;
  helpDescendants: number;
}

export interface ArchiveImpact extends ImpactRow {
  title: string;
  /** Edges naming this node from either end. They stop being drawn. */
  danglingEdges: number;
}

const ZERO = { studentsCompleted: 0, missionsHidden: 0, missionCompletions: 0, helpDescendants: 0 };

export function summariseImpact(
  set: ChartChangeSet,
  live: ChartState,
  rows: readonly ImpactRow[],
): ArchiveImpact[] {
  const byNode = new Map(rows.map((r) => [r.nodeId, r]));
  const titleOf = new Map(live.nodes.map((n) => [n.id, n.title]));

  return set.archiveNodes.map((nodeId) => ({
    ...ZERO,
    ...byNode.get(nodeId),
    nodeId,
    // Falling back to the id would print a uuid at the person deciding whether
    // to retire something. Name it or say so.
    title: titleOf.get(nodeId) ?? 'an unnamed node',
    danglingEdges: live.prereqs.filter((p) => p.nodeId === nodeId || p.prereqId === nodeId).length,
  }));
}

/** Anything a student could notice as a loss. Drives the confirm step. */
export const hasDestructiveChanges = (set: ChartChangeSet) =>
  set.archiveNodes.length > 0 || set.deleteMissions.length > 0 || set.deletePrereqs.length > 0;
