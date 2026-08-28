/**
 * The list behind "go to a node".
 *
 * Panning is the fast way across a chart and the slow way to one particular
 * node: on a course with sixty nodes, finding the one you meant is a hunt at any
 * zoom. So the chart offers the same nodes as a named list, and this is what
 * that list contains.
 *
 * Names come from `resolveName`, not from `node.title`, because the list has to
 * say what the cell under it says. A node an instructor renamed is findable by
 * the name they gave it, and by nothing else — searching for the syllabus title
 * they replaced would return a row labelled with a different name, which reads
 * as the wrong node.
 *
 * Pure and dependency-free, same contract as `progression.ts`.
 */

import { resolveName } from './naming.ts';
import type { SkillNode } from './types.ts';

export interface NodeChoice {
  id: string;
  title: string;
}

/**
 * Every node whose shown name contains `query`, in alphabetical order.
 *
 * Alphabetical rather than graph order because this list is read to find a name
 * already in mind. Prerequisite order is what the chart itself draws.
 */
export function nodeChoices(
  nodes: readonly SkillNode[],
  query: string,
): NodeChoice[] {
  const wanted = query.trim().toLowerCase();
  const choices = nodes.map((node) => ({
    id: node.id,
    title: resolveName({
      override: node.titleOverride,
      generated: node.questTitle,
      syllabus: node.title,
    }).text,
  }));

  return choices
    .filter((choice) => wanted === '' || choice.title.toLowerCase().includes(wanted))
    // `localeCompare` rather than `<`, so "Ångström" sorts with the As instead of
    // after Z where a code-point comparison puts every accented letter.
    .sort((a, b) => a.title.localeCompare(b.title));
}
