import type { SkillNode, SkillTreePayload, Mission, Achievement, AnalyticsStudent, UserProfile } from './cardinal-domain'

// Dataset 1: Standard CS210 (16 skills, branching)
export const mockCS210Payload: SkillTreePayload = {
  course: {
    id: 'cs210',
    code: 'CS210',
    title: 'Data Structures & Algorithms'
  },
  nodes: [
    { id: 'skill_1', title: 'Computational Thinking', shortTitle: 'Comp Thinking', description: 'Decompose complex academic challenges into clear algorithmic steps.', status: 'mastered', progress: 100, xpReward: 100, prerequisiteIds: [], missionIds: ['m1'], icon: 'brain' },
    { id: 'skill_2', title: 'Programming Foundations', shortTitle: 'Prog Foundations', description: 'Master core control flow, functions, and memory concepts.', status: 'mastered', progress: 100, xpReward: 150, prerequisiteIds: ['skill_1'], missionIds: ['m2'], icon: 'code' },
    { id: 'skill_3', title: 'Discrete Structures', shortTitle: 'Discrete Struct', description: 'Apply logic, sets, relations, and proof techniques.', status: 'mastered', progress: 100, xpReward: 150, prerequisiteIds: ['skill_1'], missionIds: ['m3'], icon: 'terminal' },
    { id: 'skill_4', title: 'Linear Data Structures', shortTitle: 'Linear Struct', description: 'Implement stacks, queues, linked lists, and contiguous arrays.', status: 'mastered', progress: 100, xpReward: 200, prerequisiteIds: ['skill_2'], missionIds: ['m4'], icon: 'database' },
    { id: 'skill_5', title: 'Recursion & Induction', shortTitle: 'Recursion', description: 'Solve self-referential problems with base cases and recurrences.', status: 'mastered', progress: 100, xpReward: 200, prerequisiteIds: ['skill_2'], missionIds: ['m5'], icon: 'code' },
    { id: 'skill_6', title: 'Sorting & Searching', shortTitle: 'Sort & Search', description: 'Analyze divide-and-conquer sorting algorithms and binary search.', status: 'mastered', progress: 100, xpReward: 220, prerequisiteIds: ['skill_3', 'skill_5'], missionIds: ['m6'], icon: 'code' },
    { id: 'skill_7', title: 'Trees & Traversal', shortTitle: 'Trees', description: 'Build binary search trees, AVL trees, and tree traversals.', status: 'in_progress', progress: 45, xpReward: 250, prerequisiteIds: ['skill_5', 'skill_6'], missionIds: ['m7'], icon: 'network' },
    { id: 'skill_8', title: 'Hashing & Hash Tables', shortTitle: 'Hashing', description: 'Understand hash functions, collision resolution, and O(1) lookups.', status: 'available', progress: 0, xpReward: 250, prerequisiteIds: ['skill_4'], missionIds: ['m8'], icon: 'database' },
    { id: 'skill_9', title: 'Graph Theory Foundations', shortTitle: 'Graph Theory', description: 'Represent directed graphs, adjacency matrices, and edge lists.', status: 'available', progress: 0, xpReward: 280, prerequisiteIds: ['skill_4'], missionIds: ['m9'], icon: 'network' },
    { id: 'skill_10', title: 'Algorithm Analysis', shortTitle: 'Algo Analysis', description: 'Evaluate Big-O, Big-Omega, and Big-Theta asymptotic bounds.', status: 'available', progress: 0, xpReward: 300, prerequisiteIds: ['skill_6'], missionIds: ['m10'], icon: 'brain' },
    { id: 'skill_11', title: 'Dynamic Programming', shortTitle: 'Dynamic Prog', description: 'Formulate optimal substructure and memoized state transitions.', status: 'locked', progress: 0, xpReward: 350, prerequisiteIds: ['skill_8', 'skill_10'], missionIds: ['m11'], icon: 'brain' },
    { id: 'skill_12', title: 'Greedy Algorithms', shortTitle: 'Greedy Algos', description: 'Prove greedy choice properties for interval scheduling.', status: 'locked', progress: 0, xpReward: 350, prerequisiteIds: ['skill_8', 'skill_10'], missionIds: ['m12'], icon: 'code' },
    { id: 'skill_13', title: 'Advanced Trees & Heaps', shortTitle: 'Advanced Trees', description: 'Implement priority queues, binary heaps, and balanced trees.', status: 'locked', progress: 0, xpReward: 380, prerequisiteIds: ['skill_7', 'skill_9'], missionIds: ['m13'], icon: 'network' },
    { id: 'skill_14', title: 'Graph Algorithms', shortTitle: 'Graph Algos', description: 'Master BFS, DFS, Dijkstra, Prim, and Kruskal algorithms.', status: 'locked', progress: 0, xpReward: 400, prerequisiteIds: ['skill_9'], missionIds: ['m14'], icon: 'network' },
    { id: 'skill_15', title: 'Algorithm Optimization', shortTitle: 'Optimization', description: 'Refactor algorithmic bottlenecks for maximum efficiency.', status: 'locked', progress: 0, xpReward: 450, prerequisiteIds: ['skill_11', 'skill_12'], missionIds: ['m15'], icon: 'shield' },
    { id: 'skill_16', title: 'Capstone Mastery', shortTitle: 'Capstone Mastery', description: 'Synthesize data structures, graph algorithms, and formal analysis.', status: 'locked', progress: 0, xpReward: 500, prerequisiteIds: ['skill_7', 'skill_13', 'skill_14', 'skill_15'], missionIds: ['m16'], icon: 'shield' }
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

export const prototypeMissions: Mission[] = [
  { id: 'm1', skillId: 'skill_1', title: 'Deconstruct the Problem', description: 'Break down an academic problem into discrete input, process, and output specs.', type: 'reflection', difficulty: 'Foundational', durationMinutes: 15, xpReward: 100, status: 'completed', dueAt: null },
  { id: 'm2', skillId: 'skill_2', title: 'Pointer & Memory Quiz', description: 'Trace stack vs. heap allocations in memory diagram questions.', type: 'quiz', difficulty: 'Foundational', durationMinutes: 20, xpReward: 150, status: 'completed', dueAt: null },
  { id: 'm3', skillId: 'skill_3', title: 'Induction Proof Challenge', description: 'Formulate a mathematical induction proof for sum series.', type: 'quiz', difficulty: 'Foundational', durationMinutes: 25, xpReward: 150, status: 'completed', dueAt: null },
  { id: 'm4', skillId: 'skill_4', title: 'Implement Doubly-Linked List', description: 'Write robust insert, delete, and search operations without memory leaks.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 35, xpReward: 200, status: 'completed', dueAt: null },
  { id: 'm5', skillId: 'skill_5', title: 'Recursive Tree Traversal', description: 'Write elegant pre-order, in-order, and post-order recursive methods.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 30, xpReward: 200, status: 'completed', dueAt: null },
  { id: 'm6', skillId: 'skill_6', title: 'QuickSort vs. MergeSort', description: 'Implement QuickSort partitioning and compare runtime against MergeSort.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 40, xpReward: 220, status: 'completed', dueAt: null },
  { id: 'm7', skillId: 'skill_7', title: 'BST Balancing Quest', description: 'Perform single and double rotations on unbalanced AVL nodes.', type: 'project', difficulty: 'Intermediate', durationMinutes: 45, xpReward: 250, status: 'in-progress', dueAt: null },
  { id: 'm8', skillId: 'skill_8', title: 'Hash Collision Arena', description: 'Compare linear probing, quadratic probing, and chaining under high load factor.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 30, xpReward: 250, status: 'available', dueAt: null },
  { id: 'm9', skillId: 'skill_9', title: 'Adjacency List Construction', description: 'Build a space-efficient graph representation for 10,000 vertices.', type: 'lab', difficulty: 'Intermediate', durationMinutes: 35, xpReward: 280, status: 'available', dueAt: null },
  { id: 'm10', skillId: 'skill_10', title: 'Asymptotic Analysis Suite', description: 'Determine exact Big-O complexities for nested loops and recurrence relations.', type: 'quiz', difficulty: 'Intermediate', durationMinutes: 30, xpReward: 300, status: 'available', dueAt: null },
  { id: 'm11', skillId: 'skill_11', title: 'Knapsack 0/1 Memoization', description: 'Solve the 0/1 Knapsack problem using top-down memoization and bottom-up DP table.', type: 'project', difficulty: 'Advanced', durationMinutes: 50, xpReward: 350, status: 'locked', dueAt: null },
  { id: 'm12', skillId: 'skill_12', title: 'Huffman Code Generator', description: 'Construct optimal prefix codes using a priority queue greedy strategy.', type: 'project', difficulty: 'Advanced', durationMinutes: 45, xpReward: 350, status: 'locked', dueAt: null },
  { id: 'm13', skillId: 'skill_13', title: 'Min-Heap Priority Queue', description: 'Implement heapify-up and heapify-down in a binary heap.', type: 'lab', difficulty: 'Advanced', durationMinutes: 40, xpReward: 380, status: 'locked', dueAt: null },
  { id: 'm14', skillId: 'skill_14', title: 'Dijkstra Shortest Path', description: 'Find shortest paths in weighted graphs using Dijkstra with Min-Heap.', type: 'project', difficulty: 'Advanced', durationMinutes: 50, xpReward: 400, status: 'locked', dueAt: null },
  { id: 'm15', skillId: 'skill_15', title: 'Space Complexity Refactoring', description: 'Optimize dynamic programming space complexity from O(N^2) to O(N).', type: 'project', difficulty: 'Advanced', durationMinutes: 45, xpReward: 450, status: 'locked', dueAt: null },
  { id: 'm16', skillId: 'skill_16', title: 'Cardinal Skill Capstone', description: 'Design and optimize a real-time routing engine combining all core course outcomes.', type: 'project', difficulty: 'Advanced', durationMinutes: 60, xpReward: 500, status: 'locked', dueAt: null }
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
