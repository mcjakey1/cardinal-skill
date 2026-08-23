import type { NodeStatus } from './types';

export type DisplayStatus = NodeStatus | 'in_progress';

/** Mission progress enriches the persisted unlock state without storing a fourth state. */
export function displayStatus(status: NodeStatus, progress: number): DisplayStatus {
  return status === 'available' && progress > 0 && progress < 1 ? 'in_progress' : status;
}
