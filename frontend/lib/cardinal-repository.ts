import type { SkillNode, SkillTreePayload, Mission, Achievement, AnalyticsStudent, UserProfile, QuestNaming } from './cardinal-domain'
import type { HelpStep } from '@shared/types'

// Dataset 1: Standard CS210 (16 skills, branching)
export const mockCS210Payload: SkillTreePayload = {
  course: {
    id: 'cs210',
    code: 'CS210',
    title: 'Data Structures & Algorithms'
  },
  nodes: [
    { id: 'skill_1', title: 'Computational Thinking', shortTitle: 'Comp Thinking', description: 'Decompose complex academic challenges into clear algorithmic steps.', status: 'mastered', progress: 100, xpReward: 100, prerequisiteIds: [], missionIds: ['m1'], icon: 'brain', learningObjective: 'Decompose complex academic challenges into clear input, process, and output specs.', estimatedMinutes: 30, moduleName: 'Module 1: Foundational Logic', difficultyLabel: 'Foundational' },
    { id: 'skill_2', title: 'Programming Foundations', shortTitle: 'Prog Foundations', description: 'Master core control flow, functions, and memory concepts.', status: 'mastered', progress: 100, xpReward: 150, prerequisiteIds: ['skill_1'], missionIds: ['m2'], icon: 'code', learningObjective: 'Understand stack vs heap memory allocations and procedural control flow.', estimatedMinutes: 45, moduleName: 'Module 1: Foundational Logic', difficultyLabel: 'Foundational' },
    { id: 'skill_3', title: 'Discrete Structures', shortTitle: 'Discrete Struct', description: 'Apply logic, sets, relations, and proof techniques.', status: 'mastered', progress: 100, xpReward: 150, prerequisiteIds: ['skill_1'], missionIds: ['m3'], icon: 'terminal', learningObjective: 'Formulate mathematical induction proofs for recurrence relations.', estimatedMinutes: 40, moduleName: 'Module 2: Discrete Mathematics', difficultyLabel: 'Foundational' },
    { id: 'skill_4', title: 'Linear Data Structures', shortTitle: 'Linear Struct', description: 'Implement stacks, queues, linked lists, and contiguous arrays.', status: 'mastered', progress: 100, xpReward: 200, prerequisiteIds: ['skill_2'], missionIds: ['m4', 'm4b', 'm4c'], icon: 'database', learningObjective: 'Construct pointer-based singly and doubly linked list memory structures.', estimatedMinutes: 50, moduleName: 'Module 3: Linear Structures', difficultyLabel: 'Intermediate' },
    { id: 'skill_5', title: 'Recursion & Induction', shortTitle: 'Recursion', description: 'Solve self-referential problems with base cases and recurrences.', status: 'mastered', progress: 100, xpReward: 200, prerequisiteIds: ['skill_2'], missionIds: ['m5'], icon: 'code', learningObjective: 'Write elegant recursive methods with defined base cases and runtime stacks.', estimatedMinutes: 45, moduleName: 'Module 3: Linear Structures', difficultyLabel: 'Intermediate' },
    { id: 'skill_6', title: 'Sorting & Searching', shortTitle: 'Sort & Search', description: 'Analyze divide-and-conquer sorting algorithms and binary search.', status: 'mastered', progress: 100, xpReward: 220, prerequisiteIds: ['skill_3', 'skill_5'], missionIds: ['m6', 'm6b', 'm6c'], icon: 'code', learningObjective: 'Implement QuickSort partitioning and compare runtime against MergeSort.', estimatedMinutes: 55, moduleName: 'Module 4: Searching & Sorting', difficultyLabel: 'Intermediate' },
    { id: 'skill_7', title: 'Trees & Traversal', shortTitle: 'Trees', description: 'Build binary search trees, AVL trees, and tree traversals.', status: 'in_progress', progress: 45, xpReward: 250, prerequisiteIds: ['skill_5', 'skill_6'], missionIds: ['m7', 'm7b', 'm7c'], icon: 'network', learningObjective: 'Perform single and double rotations on unbalanced BST and AVL tree nodes.', estimatedMinutes: 60, moduleName: 'Module 5: Hierarchical Structures', difficultyLabel: 'Intermediate' },
    { id: 'skill_8', title: 'Hashing & Hash Tables', shortTitle: 'Hashing', description: 'Understand hash functions, collision resolution, and O(1) lookups.', status: 'available', progress: 0, xpReward: 250, prerequisiteIds: ['skill_4'], missionIds: ['m8', 'm8b', 'm8c'], icon: 'database', learningObjective: 'Compare linear probing, quadratic probing, and chaining under high load factor.', estimatedMinutes: 45, moduleName: 'Module 5: Hierarchical Structures', difficultyLabel: 'Intermediate' },
    { id: 'skill_9', title: 'Graph Theory Foundations', shortTitle: 'Graph Theory', description: 'Represent directed graphs, adjacency matrices, and edge lists.', status: 'available', progress: 0, xpReward: 280, prerequisiteIds: ['skill_4'], missionIds: ['m9', 'm9b', 'm9c'], icon: 'network', learningObjective: 'Build space-efficient graph representations for large node vertices.', estimatedMinutes: 50, moduleName: 'Module 6: Graph Networks', difficultyLabel: 'Intermediate' },
    { id: 'skill_10', title: 'Algorithm Analysis', shortTitle: 'Algo Analysis', description: 'Evaluate Big-O, Big-Omega, and Big-Theta asymptotic bounds.', status: 'available', progress: 0, xpReward: 300, prerequisiteIds: ['skill_6'], missionIds: ['m10', 'm10b', 'm10c'], icon: 'brain', learningObjective: 'Determine exact Big-O complexities for nested loops and master theorem recurrences.', estimatedMinutes: 40, moduleName: 'Module 6: Graph Networks', difficultyLabel: 'Intermediate' },
    { id: 'skill_11', title: 'Dynamic Programming', shortTitle: 'Dynamic Prog', description: 'Formulate optimal substructure and memoized state transitions.', status: 'locked', progress: 0, xpReward: 350, prerequisiteIds: ['skill_8', 'skill_10'], missionIds: ['m11', 'm11b', 'm11c'], icon: 'brain', learningObjective: 'Solve 0/1 Knapsack problems using top-down memoization and bottom-up DP tables.', estimatedMinutes: 75, moduleName: 'Module 7: Advanced Algorithmic Strategies', difficultyLabel: 'Advanced' },
    { id: 'skill_12', title: 'Greedy Algorithms', shortTitle: 'Greedy Algos', description: 'Prove greedy choice properties for interval scheduling.', status: 'locked', progress: 0, xpReward: 350, prerequisiteIds: ['skill_8', 'skill_10'], missionIds: ['m12'], icon: 'code', learningObjective: 'Construct optimal prefix codes using priority queue greedy choices.', estimatedMinutes: 65, moduleName: 'Module 7: Advanced Algorithmic Strategies', difficultyLabel: 'Advanced' },
    { id: 'skill_13', title: 'Advanced Trees & Heaps', shortTitle: 'Advanced Trees', description: 'Implement priority queues, binary heaps, and balanced trees.', status: 'locked', progress: 0, xpReward: 380, prerequisiteIds: ['skill_7', 'skill_9'], missionIds: ['m13'], icon: 'network', learningObjective: 'Implement heapify-up and heapify-down in min-heap priority queues.', estimatedMinutes: 70, moduleName: 'Module 7: Advanced Algorithmic Strategies', difficultyLabel: 'Advanced' },
    { id: 'skill_14', title: 'Graph Algorithms', shortTitle: 'Graph Algos', description: 'Master BFS, DFS, Dijkstra, Prim, and Kruskal algorithms.', status: 'locked', progress: 0, xpReward: 400, prerequisiteIds: ['skill_9'], missionIds: ['m14', 'm14b', 'm14c'], icon: 'network', learningObjective: 'Find shortest paths in weighted graphs using Dijkstra with Min-Heap.', estimatedMinutes: 80, moduleName: 'Module 8: Graph Optimization', difficultyLabel: 'Advanced' },
    { id: 'skill_15', title: 'Algorithm Optimization', shortTitle: 'Optimization', description: 'Refactor algorithmic bottlenecks for maximum efficiency.', status: 'locked', progress: 0, xpReward: 450, prerequisiteIds: ['skill_11', 'skill_12'], missionIds: ['m15'], icon: 'shield', learningObjective: 'Optimize dynamic programming space complexity from O(N^2) to O(N).', estimatedMinutes: 85, moduleName: 'Module 8: Graph Optimization', difficultyLabel: 'Advanced' },
    { id: 'skill_16', title: 'Capstone Mastery', shortTitle: 'Capstone Mastery', description: 'Synthesize data structures, graph algorithms, and formal analysis.', status: 'locked', progress: 0, xpReward: 500, prerequisiteIds: ['skill_7', 'skill_13', 'skill_14', 'skill_15'], missionIds: ['m16'], icon: 'shield', learningObjective: 'Design and optimize a real-time routing engine combining all core outcomes.', estimatedMinutes: 120, moduleName: 'Module 9: Capstone Assessment', difficultyLabel: 'Advanced' }
  ]
}

// Dataset 2: Linear Course (6 skills)
export const mockLinearPayload: SkillTreePayload = {
  course: { id: 'lin101', code: 'CS101', title: 'Introduction to Computer Science' },
  nodes: [
    { id: 'l1', title: 'Problem Solving Basics', shortTitle: 'Problem Solving', status: 'mastered', progress: 100, xpReward: 100, prerequisiteIds: [], icon: 'brain' },
    { id: 'l2', title: 'Variables & Data Types', shortTitle: 'Variables', status: 'mastered', progress: 100, xpReward: 120, prerequisiteIds: ['l1'], icon: 'code' },
    { id: 'l3', title: 'Conditionals & Loops', shortTitle: 'Control Flow', status: 'mastered', progress: 100, xpReward: 150, prerequisiteIds: ['l2'], icon: 'code' },
    { id: 'l4', title: 'Functions & Scope', shortTitle: 'Functions', status: 'in_progress', progress: 50, xpReward: 180, prerequisiteIds: ['l3'], icon: 'terminal' },
    { id: 'l5', title: 'Basic Data Arrays', shortTitle: 'Arrays', status: 'available', progress: 0, xpReward: 200, prerequisiteIds: ['l4'], icon: 'database' },
    { id: 'l6', title: 'CS101 Capstone Project', shortTitle: 'CS101 Capstone', status: 'locked', progress: 0, xpReward: 300, prerequisiteIds: ['l5'], icon: 'shield' }
  ]
}

// Dataset 3: Wide Tree (25 skills)
export const mockWidePayload: SkillTreePayload = {
  course: { id: 'wide300', code: 'CS300', title: 'Software Engineering Realm' },
  nodes: Array.from({ length: 25 }, (_, i) => {
    const id = `w_${i + 1}`
    const title = `Skill Module ${i + 1}`
    const shortTitle = `Module ${i + 1}`
    let prereqs: string[] = []
    if (i >= 1 && i <= 4) prereqs = ['w_1']
    else if (i >= 5 && i <= 9) prereqs = [`w_${(i % 4) + 2}`]
    else if (i >= 10 && i <= 16) prereqs = [`w_${(i % 5) + 6}`]
    else if (i >= 17 && i <= 23) prereqs = [`w_${(i % 7) + 11}`]
    else if (i === 24) prereqs = ['w_20', 'w_21', 'w_22', 'w_23', 'w_24']

    const status = i < 5 ? 'mastered' : i < 10 ? 'in_progress' : i < 15 ? 'available' : 'locked'
    return {
      id,
      title,
      shortTitle,
      description: `Comprehensive practice and application of ${title}.`,
      status,
      progress: status === 'mastered' ? 100 : status === 'in_progress' ? 40 : 0,
      xpReward: 100 + i * 15,
      prerequisiteIds: prereqs,
      icon: (['code', 'database', 'network', 'shield', 'brain', 'terminal'][i % 6]) as any
    }
  })
}

// Dataset 4: Dual Foundation Roots (4 skills, 2 roots)
export const mockDualRootsPayload: SkillTreePayload = {
  course: { id: 'dual200', code: 'MATH201', title: 'Discrete Math & Logic' },
  nodes: [
    { id: 'r1', title: 'Formal Logic & Truth Tables', shortTitle: 'Formal Logic', status: 'mastered', progress: 100, xpReward: 150, prerequisiteIds: [], icon: 'terminal' },
    { id: 'r2', title: 'Set Theory & Venn Diagrams', shortTitle: 'Set Theory', status: 'mastered', progress: 100, xpReward: 150, prerequisiteIds: [], icon: 'brain' },
    { id: 'r3', title: 'Proof Techniques & Induction', shortTitle: 'Proofs', status: 'in_progress', progress: 60, xpReward: 250, prerequisiteIds: ['r1', 'r2'], icon: 'shield' },
    { id: 'r4', title: 'Combinatorics & Probability', shortTitle: 'Combinatorics', status: 'available', progress: 0, xpReward: 300, prerequisiteIds: ['r3'], icon: 'network' }
  ]
}

// Dataset 5: Invalid Data (Missing Prerequisite Reference)
export const mockMissingPrereqPayload: SkillTreePayload = {
  course: { id: 'err1', code: 'ERR101', title: 'Corrupted Syllabus' },
  nodes: [
    { id: 'e1', title: 'Valid Foundation Skill', shortTitle: 'Foundation', status: 'mastered', progress: 100, xpReward: 100, prerequisiteIds: [], icon: 'brain' },
    { id: 'e2', title: 'Broken Orphan Skill', shortTitle: 'Broken Skill', status: 'available', progress: 0, xpReward: 200, prerequisiteIds: ['non_existent_skill_999'], icon: 'code' }
  ]
}

// Dataset 6: Invalid Data (Cycle Loop)
export const mockCyclePayload: SkillTreePayload = {
  course: { id: 'err2', code: 'ERR102', title: 'Cyclic Dependency Syllabus' },
  nodes: [
    { id: 'c1', title: 'Alpha Concept', shortTitle: 'Alpha', status: 'available', progress: 0, xpReward: 100, prerequisiteIds: ['c3'], icon: 'code' },
    { id: 'c2', title: 'Beta Concept', shortTitle: 'Beta', status: 'available', progress: 0, xpReward: 100, prerequisiteIds: ['c1'], icon: 'brain' },
    { id: 'c3', title: 'Gamma Concept', shortTitle: 'Gamma', status: 'available', progress: 0, xpReward: 100, prerequisiteIds: ['c2'], icon: 'terminal' }
  ]
}

export async function getSkillTree(courseId: string): Promise<SkillTreePayload> {
  return new Promise((resolve) => {
    setTimeout(() => {
      switch (courseId) {
        case 'linear':
          resolve(mockLinearPayload)
          break
        case 'wide':
          resolve(mockWidePayload)
          break
        case 'dual-roots':
          resolve(mockDualRootsPayload)
          break
        case 'err-missing':
          resolve(mockMissingPrereqPayload)
          break
        case 'err-cycle':
          resolve(mockCyclePayload)
          break
        case 'cs210':
        default:
          resolve(mockCS210Payload)
          break
      }
    }, 150)
  })
}

/**
 * Supplemental steps for one "need extra help" request.
 *
 * ponytail: three fixed steps built from the skill's title, no model call and
 * no network. The real generator is the `suggest-subtree` Supabase Edge
 * Function; swap this body for a fetch to it and nothing else changes — the
 * return type is already that function's contract, and the XP arithmetic that
 * consumes it (`buildHelpSubtree`) is the real shared implementation, not a
 * mock.
 */
export async function requestHelpSubtree(skillId: string, skillTitle = 'this skill'): Promise<HelpStep[]> {
  if (!skillId) throw new Error('A skill is required before extra practice can be built.')
  await new Promise(resolve => setTimeout(resolve, 250))
  return [
    {
      key: `${skillId}_recall`,
      title: `Revisit what ${skillTitle} builds on`,
      description: `Re-read the ideas ${skillTitle} assumes you already have, and write down the one you are least sure about.`,
      kind: 'reading',
      prereqKeys: [],
      estimatedMinutes: 10
    },
    {
      key: `${skillId}_worked`,
      title: `Follow a worked example of ${skillTitle}`,
      description: `Work through a solved example line by line, then redo it with the solution covered.`,
      kind: 'assignment',
      prereqKeys: [`${skillId}_recall`],
      estimatedMinutes: 20
    },
    {
      key: `${skillId}_check`,
      title: `Check yourself on ${skillTitle}`,
      description: `Answer three short questions to confirm the idea holds before you return to the full skill.`,
      kind: 'assessment',
      prereqKeys: [`${skillId}_worked`],
      estimatedMinutes: 15
    }
  ]
}

/** Same cap the Edge Function enforces: `MAX_BATCH` in name-quest/index.ts. */
export const MAX_NAME_BATCH = 40

/** Same caps `usableNames()` applies to the model's output, character for character. */
function clamp(value: string, max: number): string {
  return value.trim().slice(0, max)
}

/** Stable per node id, so the same tree always gets the same names. */
function pick<T>(list: readonly T[], id: string): T {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return list[sum % list.length]
}

const QUEST_VERBS = ['Chart', 'Navigate', 'Survey', 'Trace', 'Anchor', 'Plot'] as const
const ACHIEVEMENT_NOUNS = ['Navigator', 'Cartographer', 'Surveyor', 'Pathfinder', 'Wayfinder', 'Helmsman'] as const

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/**
 * Quest and achievement names for a batch of nodes.
 *
 * ponytail: deterministic strings built from each node's own title, objective,
 * and description — no model call and no network. The real writer is the
 * `name-quest` Supabase Edge Function; this mirrors its contract exactly
 * (request takes a course, node ids and an optional tone; response is one entry
 * per named node plus a `skipped` count), so swapping this body for a `fetch`
 * changes nothing above it. Ceiling: the names are a template, not prose. The
 * upgrade is the Edge Function, not a better template here.
 *
 * The one rule that is not cosmetic: a node an instructor has already renamed
 * is skipped, never regenerated. That is what `title_override` buys server-side
 * and this promises the same thing.
 */
export async function nameQuests(
  courseId: string,
  nodes: Pick<SkillNode, 'id' | 'title' | 'description' | 'learningObjective' | 'kind'>[],
  overriddenIds: Iterable<string> = [],
  tone?: string
): Promise<{ names: QuestNaming[]; skipped: number }> {
  if (!courseId) throw new Error('A course is required before quests can be named.')
  if (!nodes.length) throw new Error('Select at least one node to name.')
  if (nodes.length > MAX_NAME_BATCH) {
    throw new Error(`Name at most ${MAX_NAME_BATCH} nodes per request. Split the tree and try again.`)
  }
  if (tone !== undefined && tone.length > 200) {
    throw new Error('Keep the tone hint under 200 characters.')
  }

  const skip = new Set(overriddenIds)
  const namable = nodes.filter(n => !skip.has(n.id))

  await new Promise(resolve => setTimeout(resolve, 400))

  const names = namable.map<QuestNaming>(node => {
    const proof = node.learningObjective || node.description
    return {
      nodeId: node.id,
      title: clamp(`${pick(QUEST_VERBS, node.id)} ${node.title}`, 80),
      subtitle: clamp(
        node.description || `Work through ${node.title} and show the idea holds.`,
        120
      ),
      achievementTitle: clamp(`${node.title} ${pick(ACHIEVEMENT_NOUNS, node.id)}`, 80),
      achievementDescription: clamp(
        proof
          ? `You proved you can ${lowerFirst(proof.replace(/\.$/, ''))}.`
          : `You proved you can work with ${lowerFirst(node.title)}.`,
        200
      )
    }
  })

  return { names, skipped: nodes.length - names.length }
}

/**
 * The work each skill is made of. A skill is worth exactly the sum of the
 * missions listed here — `nodeXpFromMissions` reads this, nothing reads the
 * node's stored `xpReward` while missions exist for it.
 *
 * So the sums are load-bearing, not decoration: skill_8 is a 250 XP node
 * because 100 + 90 + 60 is 250. Change a mission's XP and change a sibling's to
 * match, or the chart total moves and the meter says so.
 *
 * A split skill keeps its original mission id on the first mission and suffixes
 * the rest, so `m8` still means what it always meant.
 */
export const prototypeMissions: Mission[] = [
  { id: 'm1', skillId: 'skill_1', title: 'Break a problem into input, process, output', description: 'Take one problem from the course brief and write down what goes in, what happens to it, and what has to come out.', type: 'reflection', difficulty: 'Foundational', durationMinutes: 15, xpReward: 100, status: 'completed', dueAt: null },
  { id: 'm2', skillId: 'skill_2', title: 'Trace stack and heap allocations', description: 'Read six short programs and say, for every value, whether it lives on the stack or on the heap.', type: 'quiz', difficulty: 'Foundational', durationMinutes: 20, xpReward: 150, status: 'completed', dueAt: null },
  { id: 'm3', skillId: 'skill_3', title: 'Prove a sum series by induction', description: 'Write the base case, the hypothesis, and the inductive step for a closed-form sum.', type: 'quiz', difficulty: 'Foundational', durationMinutes: 25, xpReward: 150, status: 'completed', dueAt: null },

  // skill_4 · 200 XP = 80 + 70 + 50
  { id: 'm4', skillId: 'skill_4', title: 'Build a doubly linked list', description: 'Write insert, delete, and search over a doubly linked list, and leave no node unreachable.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 20, xpReward: 80, status: 'completed', dueAt: null },
  { id: 'm4b', skillId: 'skill_4', title: 'Back a stack and a queue with one array', description: 'Implement both on a fixed array, and handle the wrap-around a circular queue needs.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 20, xpReward: 70, status: 'completed', dueAt: null },
  { id: 'm4c', skillId: 'skill_4', title: 'Match the structure to the access pattern', description: 'Given five access patterns, choose between array, stack, queue, and linked list, and say what it costs.', type: 'quiz', difficulty: 'Foundational', durationMinutes: 15, xpReward: 50, status: 'completed', dueAt: null },

  { id: 'm5', skillId: 'skill_5', title: 'Write pre-order, in-order, and post-order traversals', description: 'Write the three recursive walks, each with its base case stated before the recursion.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 30, xpReward: 200, status: 'completed', dueAt: null },

  // skill_6 · 220 XP = 90 + 70 + 60
  { id: 'm6', skillId: 'skill_6', title: 'Partition an array with QuickSort', description: 'Implement Lomuto partitioning, then run it on an already-sorted array and record what happens.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 25, xpReward: 90, status: 'completed', dueAt: null },
  { id: 'm6b', skillId: 'skill_6', title: 'Merge two sorted halves', description: 'Write the merge step of MergeSort and count the comparisons it makes on your test input.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 20, xpReward: 70, status: 'completed', dueAt: null },
  { id: 'm6c', skillId: 'skill_6', title: 'Find the boundary cases in binary search', description: 'Answer five questions on the midpoint, the loop condition, and the empty range.', type: 'quiz', difficulty: 'Intermediate', durationMinutes: 15, xpReward: 60, status: 'completed', dueAt: null },

  // skill_7 · 250 XP = 100 + 90 + 60
  { id: 'm7', skillId: 'skill_7', title: 'Insert and delete in a binary search tree', description: 'Handle all three delete cases — no child, one child, two children — and keep the ordering invariant.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 25, xpReward: 100, status: 'completed', dueAt: null },
  { id: 'm7b', skillId: 'skill_7', title: 'Rebalance an AVL tree', description: 'Work the four rotation cases on paper, then implement the single and double rotations.', type: 'project', difficulty: 'Intermediate', durationMinutes: 30, xpReward: 90, status: 'in-progress', dueAt: null },
  { id: 'm7c', skillId: 'skill_7', title: 'Read a traversal back into a tree', description: 'Given a pre-order and an in-order walk of the same tree, reconstruct the tree they came from.', type: 'quiz', difficulty: 'Intermediate', durationMinutes: 15, xpReward: 60, status: 'available', dueAt: null },

  // skill_8 · 250 XP = 100 + 90 + 60
  { id: 'm8', skillId: 'skill_8', title: 'Compare probing strategies under load', description: 'Fill one table with linear probing and one with quadratic probing to a 0.9 load factor, and count the probes.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 25, xpReward: 100, status: 'available', dueAt: null },
  { id: 'm8b', skillId: 'skill_8', title: 'Build a chained hash table', description: 'Implement separate chaining, then measure how the average chain length tracks the load factor.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 20, xpReward: 90, status: 'available', dueAt: null },
  { id: 'm8c', skillId: 'skill_8', title: 'Write a hash function, then break it', description: 'Write a hash for course codes, then find the set of inputs that collides worst and say why it does.', type: 'reflection', difficulty: 'Intermediate', durationMinutes: 15, xpReward: 60, status: 'available', dueAt: null },

  // skill_9 · 280 XP = 120 + 100 + 60
  { id: 'm9', skillId: 'skill_9', title: 'Build an adjacency list for 10,000 vertices', description: 'Represent a sparse graph without a 10,000 by 10,000 matrix, and report the memory you saved.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 25, xpReward: 120, status: 'available', dueAt: null },
  { id: 'm9b', skillId: 'skill_9', title: 'Convert between matrix, list, and edge list', description: 'Write the three conversions, and check that every round trip returns the graph you started with.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 20, xpReward: 100, status: 'available', dueAt: null },
  { id: 'm9c', skillId: 'skill_9', title: 'Read a graph from its written definition', description: 'Answer six questions on degree, direction, and connectivity from descriptions in prose.', type: 'quiz', difficulty: 'Foundational', durationMinutes: 15, xpReward: 60, status: 'available', dueAt: null },

  // skill_10 · 300 XP = 120 + 100 + 80
  { id: 'm10', skillId: 'skill_10', title: 'Bound nested loops in Big-O', description: 'Give a tight bound for eight loop nests, including the ones whose inner bound depends on the outer index.', type: 'quiz', difficulty: 'Intermediate', durationMinutes: 25, xpReward: 120, status: 'available', dueAt: null },
  { id: 'm10b', skillId: 'skill_10', title: 'Apply the master theorem', description: 'Solve six recurrences with the master theorem, and name the case each one falls into.', type: 'quiz', difficulty: 'Advanced', durationMinutes: 20, xpReward: 100, status: 'available', dueAt: null },
  { id: 'm10c', skillId: 'skill_10', title: 'Time a bound against the clock', description: 'Run one algorithm over growing inputs, and say where the measured curve leaves the predicted one.', type: 'reflection', difficulty: 'Intermediate', durationMinutes: 15, xpReward: 80, status: 'available', dueAt: null },

  // skill_11 · 350 XP = 150 + 120 + 80
  { id: 'm11', skillId: 'skill_11', title: 'Solve 0/1 knapsack two ways', description: 'Write the top-down memoised solution and the bottom-up table, and confirm they agree on every input.', type: 'project', difficulty: 'Advanced', durationMinutes: 30, xpReward: 150, status: 'locked', dueAt: null },
  { id: 'm11b', skillId: 'skill_11', title: 'Find the optimal substructure', description: 'For three problems, write the recurrence and name the subproblems that overlap.', type: 'lab', difficulty: 'Advanced', durationMinutes: 25, xpReward: 120, status: 'locked', dueAt: null },
  { id: 'm11c', skillId: 'skill_11', title: 'Separate memoisation from tabulation', description: 'Answer five questions on order of evaluation, stack depth, and when each approach fits.', type: 'quiz', difficulty: 'Advanced', durationMinutes: 15, xpReward: 80, status: 'locked', dueAt: null },

  { id: 'm12', skillId: 'skill_12', title: 'Generate Huffman codes with a priority queue', description: 'Build the optimal prefix code for a character frequency table, and show why no shorter code exists.', type: 'project', difficulty: 'Advanced', durationMinutes: 45, xpReward: 350, status: 'locked', dueAt: null },
  { id: 'm13', skillId: 'skill_13', title: 'Implement heapify-up and heapify-down', description: 'Build a min-heap priority queue that keeps the heap property after every insert and every extract.', type: 'lab', difficulty: 'Advanced', durationMinutes: 40, xpReward: 380, status: 'locked', dueAt: null },

  // skill_14 · 400 XP = 160 + 140 + 100
  { id: 'm14', skillId: 'skill_14', title: 'Find shortest paths with Dijkstra', description: 'Run Dijkstra over a weighted graph with a min-heap, and say what one negative edge would do to it.', type: 'project', difficulty: 'Advanced', durationMinutes: 35, xpReward: 160, status: 'locked', dueAt: null },
  { id: 'm14b', skillId: 'skill_14', title: 'Build a minimum spanning tree twice', description: 'Implement Prim and Kruskal on the same graph, and compare the trees and the running times.', type: 'lab', difficulty: 'Advanced', durationMinutes: 30, xpReward: 140, status: 'locked', dueAt: null },
  { id: 'm14c', skillId: 'skill_14', title: 'Walk a graph breadth first and depth first', description: 'Implement BFS and DFS, then use each one to answer the question it answers best.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 20, xpReward: 100, status: 'locked', dueAt: null },

  { id: 'm15', skillId: 'skill_15', title: 'Cut a DP table from O(n²) to O(n) space', description: 'Refactor a dynamic programming solution to keep only the rows it still needs, with the same answers.', type: 'project', difficulty: 'Advanced', durationMinutes: 45, xpReward: 450, status: 'locked', dueAt: null },
  { id: 'm16', skillId: 'skill_16', title: 'Build the capstone routing engine', description: 'Combine your structures, graph algorithms, and analysis into a routing engine, and defend its complexity.', type: 'project', difficulty: 'Advanced', durationMinutes: 60, xpReward: 500, status: 'locked', dueAt: null }
]

export const prototypeAchievements: Achievement[] = [
  { id: 'a1', title: 'First Spark', description: 'Mastered your first skill in Cardinal Skill.', unlockedAt: '2026-07-28T10:00:00Z', rarity: 'common' },
  { id: 'a2', title: 'Foundation Builder', description: 'Mastered all Foundations branch skills.', unlockedAt: '2026-08-01T14:30:00Z', rarity: 'rare' },
  { id: 'a3', title: 'Tree Explorer', description: 'Master the Trees branch and complete all BST challenges.', unlockedAt: null, rarity: 'epic' },
  { id: 'a4', title: '7-Day Momentum', description: 'Maintain a 7-day active study streak.', unlockedAt: '2026-08-03T09:15:00Z', rarity: 'rare' }
]

export const prototypeAnalytics: AnalyticsStudent[] = [
  { id: 'st1', name: 'Alex Rivera', mastered: 6, progress: 38, streak: 9, status: 'on-track' },
  { id: 'st2', name: 'Bianca Santos', mastered: 9, progress: 56, streak: 12, status: 'on-track' },
  { id: 'st3', name: 'Christian Cruz', mastered: 4, progress: 25, streak: 3, status: 'needs-support' },
  { id: 'st4', name: 'Diana Mendoza', mastered: 12, progress: 75, streak: 14, status: 'on-track' },
  { id: 'st5', name: 'Ethan Reyes', mastered: 3, progress: 18, streak: 1, status: 'needs-support' }
]

export const prototypeData = {
  user: {
    id: 'usr_alex',
    name: 'Alex Rivera',
    email: 'alex.rivera@mymail.mapua.edu.ph',
    studentNumber: '2024109821',
    program: 'BS Computer Science',
    yearLevel: 2,
    role: 'student' as const,
    xp: 2840,
    level: 6,
    xpToNextLevel: 4000,
    streakDays: 9
  },
  skills: mockCS210Payload.nodes,
  missions: prototypeMissions,
  achievements: prototypeAchievements,
  analytics: prototypeAnalytics
}
