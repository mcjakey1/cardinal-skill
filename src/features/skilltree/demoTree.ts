/** A polished, privacy-safe course fixture for local demos and product captures. */

import type { SkillNode, Tree } from './types';

export const DEMO_COURSE_ID = 'demo';
export const DEMO_COURSE_TITLE = 'Discrete Mathematics';

interface DemoNodeSpec {
  id: string;
  title: string;
  moduleName: string;
  description: string;
  objective: string;
  difficulty: NonNullable<SkillNode['difficultyLabel']>;
  kind: SkillNode['kind'];
  xp: number;
  minutes: number;
  x: number;
  y: number;
  iconKey: SkillNode['iconKey'];
}

const specs: readonly DemoNodeSpec[] = [
  { id: 'logic-foundations', title: 'Logic Foundations', moduleName: 'Module 1: Logic & Sets', description: 'Translate statements into propositions and evaluate logical operators.', objective: 'Build and interpret compound propositions using precise logical notation.', difficulty: 'Foundational', kind: 'topic', xp: 60, minutes: 45, x: 0, y: 80, iconKey: 'pixel_gate' },
  { id: 'truth-tables', title: 'Truth Tables', moduleName: 'Module 1: Logic & Sets', description: 'Test equivalence, implication, and validity one row at a time.', objective: 'Use truth tables to classify arguments and logical identities.', difficulty: 'Foundational', kind: 'assignment', xp: 70, minutes: 55, x: 180, y: 0, iconKey: 'pixel_grid' },
  { id: 'set-operations', title: 'Set Operations', moduleName: 'Module 1: Logic & Sets', description: 'Work fluently with union, intersection, complements, and power sets.', objective: 'Model relationships with set notation and verify identities.', difficulty: 'Foundational', kind: 'topic', xp: 70, minutes: 50, x: 180, y: 170, iconKey: 'pixel_brackets' },
  { id: 'proof-language', title: 'Language of Proof', moduleName: 'Module 2: Proof Techniques', description: 'Turn definitions, quantifiers, and claims into proof-ready statements.', objective: 'Identify assumptions, conclusions, witnesses, and counterexamples.', difficulty: 'Intermediate', kind: 'reading', xp: 80, minutes: 60, x: 360, y: 80, iconKey: 'pixel_pointer' },
  { id: 'direct-proofs', title: 'Direct & Contrapositive Proofs', moduleName: 'Module 2: Proof Techniques', description: 'Choose a direct or contrapositive route and justify each inference.', objective: 'Construct concise proofs from definitions and known results.', difficulty: 'Intermediate', kind: 'assignment', xp: 90, minutes: 80, x: 540, y: 0, iconKey: 'pixel_brackets' },
  { id: 'induction', title: 'Mathematical Induction', moduleName: 'Module 2: Proof Techniques', description: 'Prove statements over the natural numbers with a clear inductive step.', objective: 'Connect the base case, hypothesis, and k + 1 case without hidden assumptions.', difficulty: 'Advanced', kind: 'assessment', xp: 100, minutes: 95, x: 720, y: 0, iconKey: 'pixel_binary_tree' },
  { id: 'relations', title: 'Relations & Equivalence', moduleName: 'Module 3: Discrete Structures', description: 'Recognize reflexive, symmetric, transitive, and equivalence relations.', objective: 'Classify relations and derive their equivalence classes.', difficulty: 'Intermediate', kind: 'topic', xp: 90, minutes: 70, x: 360, y: 240, iconKey: 'pixel_circuit' },
  { id: 'functions', title: 'Functions & Cardinality', moduleName: 'Module 3: Discrete Structures', description: 'Reason about injections, surjections, bijections, and countability.', objective: 'Use mappings to compare finite and infinite sets.', difficulty: 'Intermediate', kind: 'assignment', xp: 80, minutes: 75, x: 540, y: 240, iconKey: 'pixel_pointer' },
  { id: 'combinatorics', title: 'Counting Principles', moduleName: 'Module 3: Discrete Structures', description: 'Apply product, sum, permutation, and combination rules.', objective: 'Select a counting strategy and explain why it counts every outcome once.', difficulty: 'Intermediate', kind: 'topic', xp: 110, minutes: 120, x: 540, y: 120, iconKey: 'pixel_grid' },
  { id: 'graph-theory', title: 'Graph Theory', moduleName: 'Module 4: Networks & Recurrence', description: 'Analyze paths, connectivity, trees, and graph representations.', objective: 'Model a network as a graph and justify a traversal or connectivity claim.', difficulty: 'Advanced', kind: 'project', xp: 110, minutes: 100, x: 720, y: 180, iconKey: 'pixel_binary_tree' },
  { id: 'recurrence', title: 'Recurrence Relations', moduleName: 'Module 4: Networks & Recurrence', description: 'Describe recursive processes and solve common recurrence patterns.', objective: 'Connect recursive definitions to closed forms and growth rates.', difficulty: 'Advanced', kind: 'assessment', xp: 120, minutes: 110, x: 900, y: 80, iconKey: 'pixel_circuit' },
  { id: 'capstone', title: 'Discrete Systems Capstone', moduleName: 'Module 4: Networks & Recurrence', description: 'Combine proofs, counting, graphs, and recurrence in one modeled system.', objective: 'Defend a complete discrete model and communicate its assumptions.', difficulty: 'Advanced', kind: 'project', xp: 160, minutes: 180, x: 1080, y: 80, iconKey: 'pixel_chip' },
];

const nodes: SkillNode[] = specs.map((spec, sortOrder) => ({
  id: spec.id,
  courseId: DEMO_COURSE_ID,
  trackId: null,
  title: spec.title,
  moduleName: spec.moduleName,
  description: spec.description,
  learningObjective: spec.objective,
  difficultyLabel: spec.difficulty,
  kind: spec.kind,
  xpReward: spec.xp,
  estimatedMinutes: spec.minutes,
  x: spec.x,
  y: spec.y,
  sortOrder,
  iconKey: spec.iconKey,
  questTitle: spec.title,
  questSubtitle: spec.description,
  achievementTitle: `${spec.title} cleared`,
  achievementDescription: `Completed the ${spec.title.toLocaleLowerCase()} skill path.`,
}));

export const demoTree: Tree = {
  nodes,
  prereqs: [
    { nodeId: 'truth-tables', prereqId: 'logic-foundations' },
    { nodeId: 'set-operations', prereqId: 'logic-foundations' },
    { nodeId: 'proof-language', prereqId: 'truth-tables' },
    { nodeId: 'proof-language', prereqId: 'set-operations' },
    { nodeId: 'direct-proofs', prereqId: 'proof-language' },
    { nodeId: 'induction', prereqId: 'direct-proofs' },
    { nodeId: 'relations', prereqId: 'set-operations' },
    { nodeId: 'functions', prereqId: 'relations' },
    { nodeId: 'combinatorics', prereqId: 'truth-tables' },
    { nodeId: 'graph-theory', prereqId: 'functions' },
    { nodeId: 'graph-theory', prereqId: 'combinatorics' },
    { nodeId: 'recurrence', prereqId: 'induction' },
    { nodeId: 'recurrence', prereqId: 'graph-theory' },
    { nodeId: 'capstone', prereqId: 'recurrence' },
  ],
};

/** The capture starts mid-semester, with a proof skill visibly in progress. */
export const demoMasteredIds = ['logic-foundations', 'truth-tables', 'set-operations', 'proof-language'];

export const demoCompletedMissionIds = [
  'logic-symbols', 'logic-translation',
  'truth-build', 'truth-equivalence',
  'sets-venn', 'sets-identities',
  'proof-quantifiers', 'proof-counterexamples',
  'direct-even-square',
];

export const demoXp = 320;
