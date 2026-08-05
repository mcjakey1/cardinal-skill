/**
 * Say out loud what is wrong with a graph.
 *
 * `progression.ts` deliberately tolerates bad input at render time — it drops
 * edges to unknown nodes and locks anything on a cycle, so a student never sees
 * a crash. That is the right behaviour for the chart and the wrong behaviour for
 * the person authoring or importing one, who needs to be told what to fix.
 *
 * So this is the loud half of the same contract, for the authoring and import
 * paths only. Pure and dependency-free.
 */

import type { Prereq, SkillNode } from './types';

export type GraphErrorType = 'duplicate_id' | 'missing_prerequisite' | 'cycle_detected';

export interface GraphError {
  type: GraphErrorType;
  /** Written for the person fixing it, not for a log. */
  message: string;
  /** The node ids involved, so a UI can jump to them. */
  nodeIds: string[];
}

export interface GraphValidation {
  isValid: boolean;
  errors: GraphError[];
}

export function validateGraph(nodes: SkillNode[], prereqs: Prereq[]): GraphValidation {
  const errors: GraphError[] = [];

  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) duplicated.add(n.id);
    seen.add(n.id);
  }
  for (const id of duplicated) {
    errors.push({
      type: 'duplicate_id',
      message: `Two nodes share the id "${id}". Ids have to be unique.`,
      nodeIds: [id],
    });
  }

  for (const { nodeId, prereqId } of prereqs) {
    if (!seen.has(prereqId)) {
      errors.push({
        type: 'missing_prerequisite',
        message: `"${nodeId}" requires "${prereqId}", which is not on this chart.`,
        nodeIds: [nodeId],
      });
    }
  }

  const onCycle = cyclicNodes(seen, prereqs);
  if (onCycle.length > 0) {
    errors.push({
      type: 'cycle_detected',
      message: `These nodes require each other in a loop, so none of them can ever unlock: ${onCycle.join(', ')}.`,
      nodeIds: onCycle,
    });
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Every node standing on a prerequisite loop.
 *
 * Iterative three-colour DFS, matching the private `findCyclicNodes` in
 * `progression.ts`. One cycle is reported as one error rather than one per node,
 * because an author fixes a loop, not three nodes.
 */
function cyclicNodes(known: Set<string>, prereqs: Prereq[]): string[] {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;

  const edges = new Map<string, string[]>();
  for (const { nodeId, prereqId } of prereqs) {
    if (!known.has(nodeId) || !known.has(prereqId)) continue;
    const list = edges.get(nodeId);
    if (list) list.push(prereqId);
    else edges.set(nodeId, [prereqId]);
  }

  const colour = new Map<string, number>();
  const bad = new Set<string>();

  for (const start of known) {
    if (colour.get(start) !== undefined) continue;
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }];
    colour.set(start, GREY);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const out = edges.get(frame.id) ?? [];

      if (frame.next >= out.length) {
        colour.set(frame.id, BLACK);
        stack.pop();
        continue;
      }

      const child = out[frame.next]!;
      frame.next += 1;

      const childColour = colour.get(child) ?? WHITE;
      if (childColour === GREY) {
        // Back edge: everything still on the stack is standing on the loop.
        for (const f of stack) bad.add(f.id);
      } else if (childColour === WHITE) {
        colour.set(child, GREY);
        stack.push({ id: child, next: 0 });
      } else if (bad.has(child)) {
        bad.add(frame.id);
      }
    }
  }

  return [...bad];
}
