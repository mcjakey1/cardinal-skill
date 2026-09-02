import type { NodeStatus } from './types';

export type DisplayStatus = NodeStatus | 'in_progress';
export type EdgeDisplayStatus = 'completed' | 'in-progress' | 'active' | 'locked';

/** Mission progress enriches the persisted unlock state without storing a fourth state. */
export function displayStatus(status: NodeStatus, progress: number): DisplayStatus {
  return status === 'available' && progress > 0 && progress < 1 ? 'in_progress' : status;
}

/** An incoming edge reports whether its own prerequisite has been cleared. */
export function edgeDisplayStatus(
  prerequisiteStatus: NodeStatus,
  targetStatus: NodeStatus,
  targetProgress: number,
): EdgeDisplayStatus {
  if (targetStatus === 'mastered') return 'completed';
  if (targetStatus === 'available' && targetProgress > 0) return 'in-progress';
  return prerequisiteStatus === 'mastered' ? 'active' : 'locked';
}

/** The shared final leg lights only after every prerequisite opens its target. */
export function convergenceDisplayStatus(
  targetStatus: NodeStatus,
  targetProgress: number,
): EdgeDisplayStatus {
  if (targetStatus === 'mastered') return 'completed';
  if (targetStatus === 'available' && targetProgress > 0) return 'in-progress';
  return targetStatus === 'available' ? 'active' : 'locked';
}
