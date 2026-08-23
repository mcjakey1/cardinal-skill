import type { Mission, SkillNode, Tree } from './types';

export interface MockCourse {
  id: string;
  title: string;
  term: string;
  tree: Tree;
  missions: Mission[];
}

const course = (id: string, title: string, term: string, specs: readonly NodeSpec[]): MockCourse => {
  const nodes: SkillNode[] = specs.map((spec, index) => ({
    id: `${id}-${spec.key}`,
    courseId: id,
    trackId: null,
    title: spec.title,
    description: spec.description,
    kind: spec.kind ?? 'topic',
    iconKey: spec.icon,
    xpReward: spec.xp ?? 50,
    x: spec.x,
    y: spec.y,
    sortOrder: index,
    learningObjective: spec.description,
  }));
  const missions: Mission[] = specs.map((spec, index) => ({
    id: `${id}-${spec.key}-mission`,
    skillId: `${id}-${spec.key}`,
    title: spec.mission,
    description: '',
    kind: spec.kind ?? 'topic',
    xpReward: spec.xp ?? 50,
    estimatedMinutes: 45 + index * 10,
  }));
  return {
    id, title, term, missions,
    tree: {
      nodes,
      prereqs: specs.flatMap((spec) => (spec.requires ?? []).map((prereq) => ({
        prereqId: `${id}-${prereq}`,
        nodeId: `${id}-${spec.key}`,
      }))),
    },
  };
};

interface NodeSpec {
  key: string;
  title: string;
  description: string;
  mission: string;
  icon: SkillNode['iconKey'];
  x: number;
  y: number;
  requires?: readonly string[];
  kind?: SkillNode['kind'];
  xp?: number;
}

export const MOCK_COURSES: readonly MockCourse[] = [
  course('demo-cs201', 'Data Structures & Algorithms', 'CS201 · Example', [
    { key: 'pointers', title: 'Pointers & Memory', description: 'Trace addresses, references, and allocation safely.', mission: 'Draw a memory map', icon: 'pixel_pointer', x: 0, y: 0 },
    { key: 'lists', title: 'Linked Lists', description: 'Build and traverse linked structures.', mission: 'Implement list operations', icon: 'pixel_brackets', x: 160, y: 0, requires: ['pointers'] },
    { key: 'trees', title: 'Binary Search Trees', description: 'Insert, search, and reason about tree height.', mission: 'Build a search tree', icon: 'pixel_binary_tree', x: 320, y: -80, requires: ['lists'] },
    { key: 'graphs', title: 'Graph Traversals (BFS/DFS)', description: 'Choose and execute breadth- or depth-first traversal.', mission: 'Trace BFS and DFS', icon: 'pixel_binary_tree', x: 320, y: 100, requires: ['lists'] },
    { key: 'dp', title: 'Dynamic Programming', description: 'Recognize overlapping subproblems and memoize them.', mission: 'Solve a recurrence', icon: 'pixel_brackets', x: 500, y: 10, requires: ['trees', 'graphs'], kind: 'assessment', xp: 120 },
  ]),
  course('demo-cpe102', 'Digital Logic Design', 'CPE102 · Example', [
    { key: 'boolean', title: 'Boolean Algebra', description: 'Simplify logical expressions with algebraic laws.', mission: 'Simplify ten expressions', icon: 'pixel_gate', x: 0, y: 0 },
    { key: 'kmaps', title: 'Karnaugh Maps', description: 'Minimize logic functions visually.', mission: 'Complete four K-maps', icon: 'pixel_grid', x: 160, y: 0, requires: ['boolean'] },
    { key: 'combo', title: 'Combinational Circuits', description: 'Compose gates into useful stateless circuits.', mission: 'Design an adder', icon: 'pixel_circuit', x: 320, y: -70, requires: ['kmaps'] },
    { key: 'flops', title: 'Flip-Flops', description: 'Explain and use clocked storage elements.', mission: 'Trace flip-flop timing', icon: 'pixel_chip', x: 320, y: 100, requires: ['kmaps'] },
    { key: 'fsm', title: 'Finite State Machines', description: 'Model sequential behavior as states and transitions.', mission: 'Design a controller', icon: 'pixel_circuit', x: 500, y: 10, requires: ['combo', 'flops'], kind: 'project', xp: 140 },
  ]),
  course('demo-chem210', 'Organic Chemistry', 'CHEM210 · Example', [
    { key: 'groups', title: 'Functional Groups', description: 'Recognize the structures that control reactivity.', mission: 'Classify functional groups', icon: 'pixel_flask', x: 0, y: 0 },
    { key: 'stereo', title: 'Stereochemistry', description: 'Assign configuration and compare stereoisomers.', mission: 'Assign R/S configurations', icon: 'pixel_atom', x: 170, y: -70, requires: ['groups'] },
    { key: 'substitution', title: 'Nucleophilic Substitution', description: 'Predict SN1 and SN2 mechanisms and products.', mission: 'Draw substitution mechanisms', icon: 'pixel_potion', x: 170, y: 100, requires: ['groups'] },
    { key: 'spectroscopy', title: 'Spectroscopy', description: 'Use spectra to identify an unknown structure.', mission: 'Interpret an unknown spectrum', icon: 'pixel_atom', x: 360, y: 10, requires: ['stereo', 'substitution'], kind: 'assessment', xp: 120 },
  ]),
];

export function findMockCourse(id: string): MockCourse | undefined {
  return MOCK_COURSES.find((item) => item.id === id);
}
