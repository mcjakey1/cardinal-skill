/**
 * The work inside each node of the demo chart.
 *
 * Every node's missions sum to exactly that node's `xpReward` — that is the
 * invariant `missions.ts` is built on, and `demoMissions.test.ts` holds this
 * fixture to it. A fixture that drifts from the rule teaches the rule wrong.
 *
 * ponytail: fixture, same lifetime as `demoTree.ts`. Delete both together once
 * a `missions` table exists and `fetchTree` reads it.
 */

import type { Mission } from './types';

export const demoMissions: Mission[] = [
  mission('describing-read', 'describing', 'Read the chapter opener', 'reading', 20, 25),
  mission('describing-histogram', 'describing', 'Sketch three histograms', 'assignment', 30, 40),

  mission('reading-1-ch1', 'reading-1', 'Chapter 1', 'reading', 15, 30),
  mission('reading-1-ch2', 'reading-1', 'Chapter 2', 'reading', 15, 30),

  mission('probability-notes', 'probability', 'Work the lecture examples', 'topic', 35, 45),
  mission('probability-conditional', 'probability', 'Conditional probability drills', 'assignment', 25, 30),

  mission('pset-1-a', 'pset-1', 'Problems 1 to 5', 'assignment', 50, 60),
  mission('pset-1-b', 'pset-1', 'Problems 6 to 10', 'assignment', 30, 45),

  mission('distributions-normal', 'distributions', 'The normal distribution', 'topic', 35, 40),
  mission('distributions-binomial', 'distributions', 'The binomial distribution', 'topic', 25, 30),

  mission('sampling-error', 'sampling', 'Sampling error', 'topic', 30, 35),
  mission('sampling-clt', 'sampling', 'The central limit theorem', 'topic', 30, 40),

  mission('midterm-review', 'midterm', 'Review everything through sampling', 'topic', 50, 90),
  mission('midterm-sit', 'midterm', 'Sit the midterm', 'assessment', 100, 120),

  mission('final-dataset', 'final-project', 'Choose and clean a dataset', 'project', 80, 120),
  mission('final-analysis', 'final-project', 'Run and defend the analysis', 'project', 70, 150),
  mission('final-writeup', 'final-project', 'Write it up', 'project', 50, 90),
];

function mission(
  id: string,
  skillId: string,
  title: string,
  kind: Mission['kind'],
  xpReward: number,
  estimatedMinutes: number,
): Mission {
  return { id, skillId, title, description: '', kind, xpReward, estimatedMinutes };
}
