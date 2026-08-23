/**
 * The draft an instructor edits before publishing.
 *
 * Two jobs, kept apart on purpose. `working` is the state publish diffs against
 * the live chart — a plain graph, no history. `ops` is the undo stack, and every
 * op carries its own `before`, so undo is a pure inverse rather than a replay
 * from `baseline`. Publish never reads `ops`; undo never reads `baseline`.
 *
 * Pure. No storage, no React — `useChartDraft` wires those, and this file stays
 * runnable under `node --test`.
 */

import type { Mission, Prereq, SkillNode } from './types.ts';

export interface ChartState {
  nodes: SkillNode[];
  prereqs: Prereq[];
  missions: Mission[];
}

/** The editable subset of a node. Never id, courseId, or trackId. */
export type NodePatch = Partial<
  Pick<SkillNode, 'title' | 'description' | 'kind' | 'xpReward' | 'iconKey' | 'sortOrder'>
> & { titleOverride?: string | null };

export type XY = { x: number; y: number };

export type ChartOp =
  | { t: 'add'; node: SkillNode }
  | { t: 'archive'; nodeId: string }
  | { t: 'restore'; nodeId: string }
  | { t: 'field'; nodeId: string; before: NodePatch; after: NodePatch }
  | { t: 'move'; nodeId: string; before: XY; after: XY }
  | { t: 'link'; nodeId: string; prereqId: string }
  | { t: 'unlink'; nodeId: string; prereqId: string }
  | { t: 'mission'; nodeId: string; before: Mission[]; after: Mission[] };

export interface ChartDraft {
  /** As fetched. Publish compares a fresh read against this to detect staleness. */
  baseline: ChartState;
  working: ChartState;
  ops: ChartOp[];
  /** How many of `ops` are applied. Everything past it is redoable. */
  cursor: number;
}

const clone = (state: ChartState): ChartState => ({
  nodes: state.nodes.map((n) => ({ ...n })),
  prereqs: state.prereqs.map((p) => ({ ...p })),
  missions: state.missions.map((m) => ({ ...m })),
});

export function emptyDraft(state: ChartState): ChartDraft {
  return { baseline: clone(state), working: clone(state), ops: [], cursor: 0 };
}

const patchNode = (node: SkillNode, patch: NodePatch): SkillNode => ({ ...node, ...patch });

const mapNode = (state: ChartState, id: string, f: (n: SkillNode) => SkillNode): ChartState => ({
  ...state,
  nodes: state.nodes.map((n) => (n.id === id ? f(n) : n)),
});

/** One op forward. Never mutates its argument. */
function forward(state: ChartState, op: ChartOp): ChartState {
  switch (op.t) {
    case 'add':
      return { ...state, nodes: [...state.nodes, { ...op.node }] };
    case 'archive':
      return mapNode(state, op.nodeId, (n) => ({ ...n, archived: true }));
    case 'restore':
      return mapNode(state, op.nodeId, (n) => ({ ...n, archived: false }));
    case 'field':
      return mapNode(state, op.nodeId, (n) => patchNode(n, op.after));
    case 'move':
      return mapNode(state, op.nodeId, (n) => ({ ...n, x: op.after.x, y: op.after.y }));
    case 'link':
      return state.prereqs.some((p) => p.nodeId === op.nodeId && p.prereqId === op.prereqId)
        ? state
        : { ...state, prereqs: [...state.prereqs, { nodeId: op.nodeId, prereqId: op.prereqId }] };
    case 'unlink':
      return {
        ...state,
        prereqs: state.prereqs.filter((p) => !(p.nodeId === op.nodeId && p.prereqId === op.prereqId)),
      };
    case 'mission':
      return {
        ...state,
        missions: [...state.missions.filter((m) => m.skillId !== op.nodeId), ...op.after.map((m) => ({ ...m }))],
      };
  }
}

/** The exact inverse of `forward`. This is why every op carries `before`. */
function backward(state: ChartState, op: ChartOp): ChartState {
  switch (op.t) {
    case 'add':
      return { ...state, nodes: state.nodes.filter((n) => n.id !== op.node.id) };
    case 'archive':
      return mapNode(state, op.nodeId, (n) => ({ ...n, archived: false }));
    case 'restore':
      return mapNode(state, op.nodeId, (n) => ({ ...n, archived: true }));
    case 'field':
      return mapNode(state, op.nodeId, (n) => patchNode(n, op.before));
    case 'move':
      return mapNode(state, op.nodeId, (n) => ({ ...n, x: op.before.x, y: op.before.y }));
    case 'link':
      return forward(state, { ...op, t: 'unlink' });
    case 'unlink':
      return forward(state, { ...op, t: 'link' });
    case 'mission':
      return {
        ...state,
        missions: [...state.missions.filter((m) => m.skillId !== op.nodeId), ...op.before.map((m) => ({ ...m }))],
      };
  }
}

export function applyOp(draft: ChartDraft, op: ChartOp): ChartDraft {
  // A new op after an undo drops the redo tail. Keeping it would let redo
  // replay an op against a state it was never recorded on.
  const ops = [...draft.ops.slice(0, draft.cursor), op];
  return { ...draft, working: forward(draft.working, op), ops, cursor: ops.length };
}

export const canUndo = (draft: ChartDraft) => draft.cursor > 0;
export const canRedo = (draft: ChartDraft) => draft.cursor < draft.ops.length;

export function undo(draft: ChartDraft): ChartDraft {
  if (!canUndo(draft)) return draft;
  const op = draft.ops[draft.cursor - 1]!;
  return { ...draft, working: backward(draft.working, op), cursor: draft.cursor - 1 };
}

export function redo(draft: ChartDraft): ChartDraft {
  if (!canRedo(draft)) return draft;
  const op = draft.ops[draft.cursor]!;
  return { ...draft, working: forward(draft.working, op), cursor: draft.cursor + 1 };
}
