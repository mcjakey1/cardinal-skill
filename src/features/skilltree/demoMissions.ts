/** Privacy-safe mission fixtures for the bundled Discrete Mathematics course. */

import type { Mission } from './types';

export const demoMissions: Mission[] = [
  mission('logic-symbols', 'logic-foundations', 'Decode the logic symbols', 'reading', 25, 20, 'easy'),
  mission('logic-translation', 'logic-foundations', 'Translate six everyday claims', 'assignment', 35, 30, 'easy'),
  mission('truth-build', 'truth-tables', 'Build three truth tables', 'assignment', 35, 35, 'easy'),
  mission('truth-equivalence', 'truth-tables', 'Verify De Morgan\'s laws', 'assignment', 35, 35, 'medium'),
  mission('sets-venn', 'set-operations', 'Map a survey with Venn diagrams', 'assignment', 30, 30, 'easy'),
  mission('sets-identities', 'set-operations', 'Prove two set identities', 'assignment', 40, 40, 'medium'),
  mission('proof-quantifiers', 'proof-language', 'Negate quantified statements', 'reading', 35, 30, 'medium'),
  mission('proof-counterexamples', 'proof-language', 'Find decisive counterexamples', 'assignment', 45, 40, 'medium'),
  mission('direct-even-square', 'direct-proofs', 'Prove the square of an even integer is even', 'assignment', 40, 35, 'medium'),
  mission('direct-contrapositive', 'direct-proofs', 'Choose a contrapositive proof', 'assignment', 50, 45, 'hard'),
  mission('induction-series', 'induction', 'Prove the arithmetic series formula', 'assessment', 45, 45, 'medium'),
  mission('induction-divisibility', 'induction', 'Prove a divisibility pattern', 'assessment', 55, 50, 'hard'),
  mission('relations-properties', 'relations', 'Classify relation properties', 'assignment', 40, 35, 'medium'),
  mission('relations-classes', 'relations', 'Construct equivalence classes', 'assignment', 50, 40, 'hard'),
  mission('functions-mappings', 'functions', 'Classify six mappings', 'assignment', 35, 35, 'medium'),
  mission('functions-cardinality', 'functions', 'Build a cardinality argument', 'assignment', 45, 40, 'hard'),
  mission('counting-rules', 'combinatorics', 'Choose the correct counting rule', 'topic', 45, 35, 'medium'),
  mission('counting-committee', 'combinatorics', 'Solve a committee selection case', 'assignment', 65, 50, 'hard'),
  mission('graphs-traversal', 'graph-theory', 'Trace BFS and DFS', 'assignment', 45, 40, 'medium'),
  mission('graphs-campus', 'graph-theory', 'Model a campus route network', 'project', 65, 60, 'hard'),
  mission('recurrence-model', 'recurrence', 'Model a recursive process', 'assignment', 50, 45, 'medium'),
  mission('recurrence-solve', 'recurrence', 'Solve and verify a recurrence', 'assessment', 70, 65, 'hard'),
  mission('capstone-model', 'capstone', 'Design a discrete system model', 'project', 70, 75, 'hard'),
  mission('capstone-defense', 'capstone', 'Present and defend the model', 'project', 90, 105, 'hard'),
];

function mission(id: string, skillId: string, title: string, kind: Mission['kind'], xpReward: number, estimatedMinutes: number, difficulty: NonNullable<Mission['difficulty']>): Mission {
  return {
    id,
    skillId,
    title,
    description: `Complete the ${title.toLocaleLowerCase()} activity and record your reasoning.`,
    kind,
    xpReward,
    estimatedMinutes,
    difficulty,
  };
}
