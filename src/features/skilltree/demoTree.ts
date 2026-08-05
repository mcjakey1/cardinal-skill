/**
 * A hand-written chart for `/tree/demo`, so the app can be shown without a
 * Supabase project behind it.
 *
 * ponytail: fixture, not a seed script. It exists to make the chart visible on a
 * laptop with no backend. Delete this file and the branch in `fetchTree` once
 * `supabase start` plus a seeded course is the normal way to run the app.
 */

import type { SkillNode, Tree } from './types';

export const DEMO_COURSE_ID = 'demo';
export const DEMO_COURSE_TITLE = 'Statistics 101';

/** Statistics 101, half a semester in. Coordinates read left to right. */
const nodes: SkillNode[] = [
  n('describing', 'Describing data', 'topic', 50, 0, 0, 1, 'Mean, median, spread, and the shapes a histogram can take.'),
  n('reading-1', 'Chapters 1–2', 'reading', 30, 0, 130, 2, 'Read before the second lecture.'),
  n('probability', 'Probability', 'topic', 60, 150, 65, 3, 'Events, independence, and conditional probability.'),
  n('pset-1', 'Problem set 1', 'assignment', 80, 150, 205, 4, 'Ten problems on summary statistics.'),
  n('distributions', 'Distributions', 'topic', 60, 300, 0, 5, 'Normal, binomial, and when each one applies.'),
  n('sampling', 'Sampling', 'topic', 60, 300, 145, 6, 'Sampling error and the central limit theorem.'),
  n('midterm', 'Midterm', 'assessment', 150, 450, 70, 7, 'Covers everything through sampling.'),
  n('final-project', 'Final analysis', 'project', 200, 600, 70, 8, 'Analyse a dataset of your choosing and defend the method.'),
];

export const demoTree: Tree = {
  nodes,
  prereqs: [
    { nodeId: 'probability', prereqId: 'describing' },
    { nodeId: 'probability', prereqId: 'reading-1' },
    { nodeId: 'pset-1', prereqId: 'reading-1' },
    { nodeId: 'distributions', prereqId: 'probability' },
    { nodeId: 'sampling', prereqId: 'probability' },
    { nodeId: 'sampling', prereqId: 'pset-1' },
    { nodeId: 'midterm', prereqId: 'distributions' },
    { nodeId: 'midterm', prereqId: 'sampling' },
    { nodeId: 'final-project', prereqId: 'midterm' },
  ],
};

/** Two nodes done: enough to show mastered, available, and locked at once. */
export const demoMasteredIds = ['describing', 'reading-1'];

export const demoXp = 80;

function n(
  id: string,
  title: string,
  kind: SkillNode['kind'],
  xpReward: number,
  x: number,
  y: number,
  sortOrder: number,
  description: string,
): SkillNode {
  return { id, courseId: DEMO_COURSE_ID, trackId: null, title, description, kind, xpReward, x, y, sortOrder };
}
