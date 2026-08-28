/**
 * The course outline: every node in study order, with the status a student
 * sees, split around the one they have selected.
 *
 * The pieces this folds together — prerequisite status, mission progress, the
 * display state that turns "available with some work done" into "in progress" —
 * are each tested on their own. The wiring was not, because it only ever
 * existed inside the tree screen. That is where the bugs were: a selection that
 * is no longer in the tree, a position counter that restarted after the
 * selected row, a graph walk repeated on every keystroke.
 *
 * Pure, so the screen can be asserted against without rendering it.
 */

import { displayStatus, type DisplayStatus } from './nodeVisualState.ts';
import { deriveStatuses } from './progression.ts';
import { nodeProgress } from './rollup.ts';
import type { MissionLike } from './missions.ts';
import type { SkillNode, Tree } from './types';

export interface OutlineEntry {
  node: SkillNode;
  /** 1-based, counted over the whole outline — what a screen reader announces. */
  position: number;
  status: DisplayStatus;
}

export interface CourseOutline {
  /** Entries above the selected one, in study order. */
  before: readonly OutlineEntry[];
  /**
   * The selected entry, or null when nothing is selected — or when the
   * selection is no longer in the tree, which happens to an instructor who
   * deletes the node they were editing. The outline stays whole either way.
   */
  current: OutlineEntry | null;
  /** Entries below the selected one, in study order. */
  after: readonly OutlineEntry[];
  masteredCount: number;
  total: number;
  /** node id → 0–1. The chart draws meters from the same walk the outline used. */
  progressByNode: Record<string, number>;
}

export interface CourseOutlineInput {
  tree: Tree;
  missions: readonly MissionLike[];
  completedMissionIds: Iterable<string>;
  masteredIds: readonly string[];
  selectedId: string | null;
}

export function courseOutline(input: CourseOutlineInput): CourseOutline {
  const { tree, missions, completedMissionIds, masteredIds, selectedId } = input;
  const mastered = new Set(masteredIds);
  const statuses = deriveStatuses(tree, masteredIds).status;

  // Study order, not storage order. `sortOrder` is usually syllabus order.
  const ordered = tree.nodes.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const progressByNode: Record<string, number> = {};
  const entries = ordered.map((node, index): OutlineEntry => {
    const progress = nodeProgress(node, missions, completedMissionIds, mastered.has(node.id));
    progressByNode[node.id] = progress;
    return {
      node,
      position: index + 1,
      status: displayStatus(statuses.get(node.id) ?? 'locked', progress),
    };
  });

  const currentIndex = selectedId === null
    ? -1
    : entries.findIndex((entry) => entry.node.id === selectedId);

  return {
    before: currentIndex === -1 ? entries : entries.slice(0, currentIndex),
    current: currentIndex === -1 ? null : entries[currentIndex]!,
    after: currentIndex === -1 ? [] : entries.slice(currentIndex + 1),
    // Counted against the outline, so a stale mastered id from another course
    // cannot inflate "3 of 2 nodes mastered".
    masteredCount: entries.filter((entry) => mastered.has(entry.node.id)).length,
    total: entries.length,
    progressByNode,
  };
}
