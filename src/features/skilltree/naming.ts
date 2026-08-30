/**
 * Which of a node's several names to actually show.
 *
 * A node can carry three: the title from the syllabus, a quest name written by
 * `name-quest`, and a title an instructor typed by hand. The rule is one line —
 * an override wins, then the generated name, then the syllabus — and it is here
 * rather than in a screen because the chart, the detail window, the mission list
 * and the record all have to agree. Two screens disagreeing about what a node is
 * called is the same node twice as far as a student is concerned.
 *
 * The source travels with the text so a UI can say *which* name it is showing.
 * It is a word, never a colour: "generated" and "renamed" mean different things
 * to an instructor deciding whether to regenerate.
 *
 * Pure and dependency-free, same contract as `progression.ts`.
 */

import type { SkillNode } from './types';

/** Longest a name gets. Matches the cap `name-quest` applies server-side. */
export const MAX_NAME = 80;

export type NameSource = 'override' | 'generated' | 'syllabus';

export interface ResolvedName {
  text: string;
  source: NameSource;
}

export function resolveName(parts: {
  override?: string | null;
  generated?: string | null;
  /** The syllabus title. Required: every node has one, so naming cannot fail. */
  syllabus: string;
}): ResolvedName {
  const override = parts.override?.trim();
  if (override) return { text: override, source: 'override' };

  const generated = parts.generated?.trim();
  if (generated) return { text: generated, source: 'generated' };

  return { text: parts.syllabus, source: 'syllabus' };
}

/**
 * The same rule for a node, with the local override the caller is holding.
 *
 * Local beats stored because the local one is an edit this device has made and
 * not yet pushed — auth is not wired, so `title_override` is unreachable for
 * writing. Showing the stored name over it would silently undo what someone just
 * typed.
 */
export function resolveQuestName(node: SkillNode, localOverride?: string | null): ResolvedName {
  return resolveName({
    override: localOverride?.trim() || node.titleOverride,
    generated: node.questTitle,
    syllabus: node.title,
  });
}

/**
 * A typed name on its way into storage: trimmed, capped, and empty read as no
 * override at all — clearing the field is how an instructor reverts to the
 * generated name, so blank has to mean "remove", not "name it nothing".
 */
export function normaliseOverride(raw: string): string | null {
  return raw.trim().slice(0, MAX_NAME) || null;
}
