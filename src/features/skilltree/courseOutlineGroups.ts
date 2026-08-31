import type { OutlineEntry } from './courseOutline.ts';

export interface OutlineModule {
  title: string;
  entries: readonly OutlineEntry[];
  mastered: number;
}

/** Groups syllabus-order entries without changing their navigation order. */
export function groupOutlineByModule(entries: readonly OutlineEntry[]): OutlineModule[] {
  const groups = new Map<string, OutlineEntry[]>();
  for (const entry of entries) {
    const title = entry.node.moduleName?.trim() || 'Course skills';
    const group = groups.get(title);
    if (group) group.push(entry);
    else groups.set(title, [entry]);
  }
  return [...groups].map(([title, moduleEntries]) => ({
    title,
    entries: moduleEntries,
    mastered: moduleEntries.filter((entry) => entry.status === 'mastered').length,
  }));
}
