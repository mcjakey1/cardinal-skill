/**
 * The rules the shared node editor follows, with no React and no storage.
 *
 * Both surfaces render the same editor. What they must not share is where the
 * edit lands: a student's Playground edit stays on the device, an instructor's
 * accumulates in the publish draft. So this file holds only the part that has
 * to agree — what a form full of strings *means*. Which typed name counts as an
 * override, what a node is worth once it has missions, and why a link is
 * refused.
 *
 * Pure, same contract as `progression.ts`.
 */

import {
  finalizeMissionDrafts,
  toMissionDrafts,
  type MissionDraft,
} from './missionEditing.ts';
import { normaliseOverride, resolveName } from './naming.ts';
import { resolvePixelIcon, type PixelIconKey } from './pixelIcons.ts';
import type { Mission, NodeKind, Prereq, SkillNode } from './types.ts';
import { validateGraph } from './validation.ts';

/** XP the database accepts is 0–10000; this is the range a node is worth reading. */
export const XP_MIN = 1;
export const XP_MAX = 2000;

export const NODE_KINDS: NodeKind[] = ['topic', 'reading', 'assignment', 'assessment', 'project'];

/** The editor's state while it is being typed into: strings, not numbers. */
export interface NodeEditForm {
  title: string;
  description: string;
  kind: NodeKind;
  /** Ignored while the node has missions — their sum wins. */
  xp: string;
  iconKey: PixelIconKey;
  universal: boolean;
  missions: MissionDraft[];
}

/** What the surface has to store. Neither field says *where*. */
export interface NodeEdit {
  /** A name typed by hand, or null to fall back to the generated or syllabus one. */
  titleOverride: string | null;
  description: string;
  kind: NodeKind;
  xpReward: number;
  iconKey: PixelIconKey;
  universal: boolean;
  /** Replaces every mission on this node. */
  missions: Mission[];
}

export function nodeEditForm(node: SkillNode, missions: readonly Mission[]): NodeEditForm {
  return {
    title: resolveName({
      override: node.titleOverride,
      generated: node.questTitle,
      syllabus: node.title,
    }).text,
    description: node.description,
    kind: node.kind,
    xp: String(node.xpReward),
    iconKey: resolvePixelIcon(node),
    universal: Boolean(node.trackId),
    missions: toMissionDrafts(missions),
  };
}

/** What the editor cannot save yet, keyed by the field to mark. Empty when it can. */
export function nodeEditProblems(form: NodeEditForm): { title?: string; xp?: string } {
  const problems: { title?: string; xp?: string } = {};
  if (form.title.trim() === '') problems.title = 'A node needs a name.';

  // Only when the node authors its own XP. With missions the input is not shown
  // at all, so a stale number in it must not block the save.
  if (form.missions.length === 0) {
    const xp = Number.parseInt(form.xp, 10);
    if (Number.isNaN(xp) || xp < XP_MIN || xp > XP_MAX) {
      problems.xp = `A node is worth between ${XP_MIN} and ${XP_MAX} XP.`;
    }
  }
  return problems;
}

export function nodeEditResult(form: NodeEditForm, node: SkillNode): NodeEdit {
  const missions = finalizeMissionDrafts(form.missions);
  const typed = form.title.trim();
  return {
    // Written as an override, never over the syllabus title: that is the column
    // `name-quest` checks before it renames anything (0002:45). A name equal to
    // the syllabus title is not an override, it is agreement.
    titleOverride: typed === node.title.trim() ? null : normaliseOverride(typed),
    description: form.description.trim(),
    kind: form.kind,
    iconKey: form.iconKey,
    universal: form.universal,
    // A node with missions is worth their sum. Publish recomputes it the same
    // way (0015:252), so a typed value there would only snap back.
    xpReward:
      missions.length > 0
        ? missions.reduce((sum, m) => sum + m.xpReward, 0)
        : Math.max(XP_MIN, Math.min(XP_MAX, Number.parseInt(form.xp, 10) || XP_MIN)),
    missions,
  };
}

/** Whether two mission lists for one node are the same work. Order counts. */
export function missionsEqual(a: readonly Mission[], b: readonly Mission[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((m, i) => {
    const other = b[i]!;
    return m.id === other.id
      && m.title === other.title
      && m.description === other.description
      && m.kind === other.kind
      && m.xpReward === other.xpReward
      && m.estimatedMinutes === other.estimatedMinutes;
  });
}

/**
 * Why this edge cannot be drawn, or null if it can.
 *
 * One message set for both surfaces: an instructor who learned the student
 * chart should not be told a different thing about the same refusal.
 */
export function linkRefusal(
  nodes: SkillNode[],
  prereqs: Prereq[],
  prereqId: string,
  nodeId: string,
): string | null {
  if (prereqId === nodeId) return 'A node cannot require itself.';
  const next = [
    ...prereqs.filter((p) => !(p.prereqId === prereqId && p.nodeId === nodeId)),
    { nodeId, prereqId },
  ];
  // Refuse what this edge breaks, not what the chart was already guilty of.
  // A chart under construction is disconnected until the last edge is drawn, so
  // whole-chart validity would refuse every edge including the ones that fix it.
  const before = new Map<string, Set<string>>();
  for (const e of validateGraph(nodes, prereqs).errors) {
    const ids = before.get(e.type) ?? new Set<string>();
    for (const id of e.nodeIds) ids.add(id);
    before.set(e.type, ids);
  }
  // Compared per node rather than per error because adding an edge shrinks the
  // orphan set: the same disconnected_graph error legitimately names fewer nodes
  // afterwards, and that is an improvement, not a new fault.
  const introduced = validateGraph(nodes, next).errors.find(
    (e) => !e.nodeIds.every((id) => before.get(e.type)?.has(id)),
  );
  if (!introduced) return null;
  return introduced.message;
}

/**
 * A uuid for a row the editor just added.
 *
 * `crypto.randomUUID` is there on web, but `app.json` targets ios and android
 * and this repo carries no `react-native-get-random-values` or `expo-crypto`
 * polyfill, so calling it unguarded crashes ADD NODE on Hermes.
 * `subtree.ts:82` takes its generator as a parameter to dodge the same global.
 * `skill_nodes.id` and `missions.id` are `uuid`, so the fallback has to be
 * v4-shaped rather than merely unique.
 *
 * ponytail: Math.random fallback, not cryptographic. Fine for a row id nobody
 * has to guess; reach for expo-crypto only if an id ever has to be unguessable.
 */
export function mintId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (ch) => {
    const n = Number(ch);
    return (n ^ (Math.floor(Math.random() * 256) & (15 >> (n / 4)))).toString(16);
  });
}
