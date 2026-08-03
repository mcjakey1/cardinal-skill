import type { SkillNode, Mission, Achievement, AnalyticsStudent, UserProfile } from './cardinal-domain'

export interface PrototypeData {
  user: UserProfile
  skills: SkillNode[]
  missions: Mission[]
  achievements: Achievement[]
  analytics: AnalyticsStudent[]
}

export const prototypeSkills: SkillNode[] = [
  // Row 1 (y: 80)
  {
    id: 'skill_1',
    courseId: 'CS210',
    title: 'Computational Thinking',
    shortTitle: 'Comp Thinking',
    description: 'Decompose complex academic challenges into clear algorithmic steps.',
    status: 'mastered',
    progress: 100,
    xpReward: 100,
    position: { x: 480, y: 80 },
    prerequisites: [],
    missionIds: ['m1'],
    icon: 'brain'
  },

  // Row 2 (y: 210)
  {
    id: 'skill_2',
    courseId: 'CS210',
    title: 'Programming Foundations',
    shortTitle: 'Prog Foundations',
    description: 'Master core control flow, functions, and memory concepts.',
    status: 'mastered',
    progress: 100,
    xpReward: 150,
    position: { x: 320, y: 210 },
    prerequisites: ['skill_1'],
    missionIds: ['m2'],
    icon: 'code'
  },
  {
    id: 'skill_3',
    courseId: 'CS210',
    title: 'Discrete Structures',
    shortTitle: 'Discrete Struct',
    description: 'Apply logic, sets, relations, and proof techniques.',
    status: 'mastered',
    progress: 100,
    xpReward: 150,
    position: { x: 640, y: 210 },
    prerequisites: ['skill_1'],
    missionIds: ['m3'],
    icon: 'terminal'
  },

  // Row 3 (y: 340)
  {
    id: 'skill_4',
    courseId: 'CS210',
    title: 'Linear Data Structures',
    shortTitle: 'Linear Struct',
    description: 'Implement stacks, queues, linked lists, and contiguous arrays.',
    status: 'mastered',
    progress: 100,
    xpReward: 200,
    position: { x: 160, y: 340 },
    prerequisites: ['skill_2'],
    missionIds: ['m4'],
    icon: 'database'
  },
  {
    id: 'skill_5',
    courseId: 'CS210',
    title: 'Recursion & Induction',
    shortTitle: 'Recursion',
    description: 'Solve self-referential problems with base cases and recurrences.',
    status: 'mastered',
    progress: 100,
    xpReward: 200,
    position: { x: 370, y: 340 },
    prerequisites: ['skill_2'],
    missionIds: ['m5'],
    icon: 'code'
  },
  {
    id: 'skill_6',
    courseId: 'CS210',
    title: 'Sorting & Searching',
    shortTitle: 'Sort & Search',
    description: 'Analyze divide-and-conquer sorting algorithms and binary search.',
    status: 'mastered',
    progress: 100,
    xpReward: 220,
    position: { x: 590, y: 340 },
    prerequisites: ['skill_3', 'skill_5'],
    missionIds: ['m6'],
    icon: 'code'
  },
  {
    id: 'skill_7',
    courseId: 'CS210',
    title: 'Trees & Traversal',
    shortTitle: 'Trees',
    description: 'Build binary search trees, AVL trees, and tree traversals.',
    status: 'available',
    progress: 45,
    xpReward: 250,
    position: { x: 800, y: 340 },
    prerequisites: ['skill_5', 'skill_6'],
    missionIds: ['m7'],
    icon: 'network'
  },

  // Row 4 (y: 470)
  {
    id: 'skill_8',
    courseId: 'CS210',
    title: 'Hashing & Hash Tables',
    shortTitle: 'Hashing',
    description: 'Understand hash functions, collision resolution, and O(1) lookups.',
    status: 'available',
    progress: 0,
    xpReward: 250,
    position: { x: 220, y: 470 },
    prerequisites: ['skill_4'],
    missionIds: ['m8'],
    icon: 'database'
  },
  {
    id: 'skill_9',
    courseId: 'CS210',
    title: 'Graph Theory Foundations',
    shortTitle: 'Graph Theory',
    description: 'Represent directed graphs, adjacency matrices, and edge lists.',
    status: 'available',
    progress: 0,
    xpReward: 280,
    position: { x: 480, y: 470 },
    prerequisites: ['skill_4'],
    missionIds: ['m9'],
    icon: 'network'
  },
  {
    id: 'skill_10',
    courseId: 'CS210',
    title: 'Algorithm Analysis',
    shortTitle: 'Algo Analysis',
    description: 'Evaluate Big-O, Big-Omega, and Big-Theta asymptotic bounds.',
    status: 'available',
    progress: 0,
    xpReward: 300,
    position: { x: 740, y: 470 },
    prerequisites: ['skill_6'],
    missionIds: ['m10'],
    icon: 'brain'
  },

  // Row 5 (y: 600)
  {
    id: 'skill_11',
    courseId: 'CS210',
    title: 'Dynamic Programming',
    shortTitle: 'Dynamic Prog',
    description: 'Formulate optimal substructure and memoized state transitions.',
    status: 'locked',
    progress: 0,
    xpReward: 350,
    position: { x: 140, y: 600 },
    prerequisites: ['skill_8', 'skill_10'],
    missionIds: ['m11'],
    icon: 'brain'
  },
  {
    id: 'skill_12',
    courseId: 'CS210',
    title: 'Greedy Algorithms',
    shortTitle: 'Greedy Algos',
    description: 'Prove greedy choice properties for interval scheduling and Huffman coding.',
    status: 'locked',
    progress: 0,
    xpReward: 350,
    position: { x: 360, y: 600 },
    prerequisites: ['skill_8', 'skill_10'],
    missionIds: ['m12'],
    icon: 'code'
  },
  {
    id: 'skill_13',
    courseId: 'CS210',
    title: 'Advanced Trees & Heaps',
    shortTitle: 'Advanced Trees',
    description: 'Implement priority queues, binary heaps, and balanced tree variants.',
    status: 'locked',
    progress: 0,
    xpReward: 380,
    position: { x: 600, y: 600 },
    prerequisites: ['skill_7', 'skill_9'],
    missionIds: ['m13'],
    icon: 'network'
  },
  {
    id: 'skill_14',
    courseId: 'CS210',
    title: 'Graph Algorithms',
    shortTitle: 'Graph Algos',
    description: 'Master BFS, DFS, Dijkstra, Prim, and Kruskal algorithms.',
    status: 'locked',
    progress: 0,
    xpReward: 400,
    position: { x: 820, y: 600 },
    prerequisites: ['skill_9'],
    missionIds: ['m14'],
    icon: 'network'
  },

  // Row 6 (y: 730)
  {
    id: 'skill_15',
    courseId: 'CS210',
    title: 'Algorithm Optimization',
    shortTitle: 'Optimization',
    description: 'Refactor algorithmic bottlenecks for maximum spatial and temporal efficiency.',
    status: 'locked',
    progress: 0,
    xpReward: 450,
    position: { x: 350, y: 730 },
    prerequisites: ['skill_11', 'skill_12'],
    missionIds: ['m15'],
    icon: 'shield'
  },
  {
    id: 'skill_16',
    courseId: 'CS210',
    title: 'Capstone Mastery',
    shortTitle: 'Capstone Mastery',
    description: 'Synthesize data structures, graph algorithms, and formal analysis.',
    status: 'locked',
    progress: 0,
    xpReward: 500,
    position: { x: 650, y: 730 },
    prerequisites: ['skill_7', 'skill_13', 'skill_14', 'skill_15'],
    missionIds: ['m16'],
    icon: 'shield'
  }
]

export const prototypeMissions: Mission[] = [
  {
    id: 'm1',
    skillId: 'skill_1',
    title: 'Deconstruct the Problem',
    description: 'Break down an academic problem into discrete input, process, and output specs.',
    type: 'reflection',
    difficulty: 'Foundational',
    durationMinutes: 15,
    xpReward: 100,
    status: 'completed',
    dueAt: null
  },
  {
    id: 'm2',
    skillId: 'skill_2',
    title: 'Pointer & Memory Quiz',
    description: 'Trace stack vs. heap allocations in memory diagram questions.',
    type: 'quiz',
    difficulty: 'Foundational',
    durationMinutes: 20,
    xpReward: 150,
    status: 'completed',
    dueAt: null
  },
  {
    id: 'm3',
    skillId: 'skill_3',
    title: 'Induction Proof Challenge',
    description: 'Formulate a mathematical induction proof for sum series.',
    type: 'quiz',
    difficulty: 'Foundational',
    durationMinutes: 25,
    xpReward: 150,
    status: 'completed',
    dueAt: null
  },
  {
    id: 'm4',
    skillId: 'skill_4',
    title: 'Implement Doubly-Linked List',
    description: 'Write robust insert, delete, and search operations without memory leaks.',
    type: 'lab',
    difficulty: 'Intermediate',
    durationMinutes: 35,
    xpReward: 200,
    status: 'completed',
    dueAt: null
  },
  {
    id: 'm5',
    skillId: 'skill_5',
    title: 'Recursive Tree Traversal',
    description: 'Write elegant pre-order, in-order, and post-order recursive methods.',
    type: 'lab',
    difficulty: 'Intermediate',
    durationMinutes: 30,
    xpReward: 200,
    status: 'completed',
    dueAt: null
  },
  {
    id: 'm6',
    skillId: 'skill_6',
    title: 'QuickSort vs. MergeSort',
    description: 'Implement QuickSort partitioning and compare runtime against MergeSort.',
    type: 'lab',
    difficulty: 'Intermediate',
    durationMinutes: 40,
    xpReward: 220,
    status: 'completed',
    dueAt: null
  },
  {
    id: 'm7',
    skillId: 'skill_7',
    title: 'BST Balancing Quest',
    description: 'Perform single and double rotations on unbalanced AVL nodes.',
    type: 'project',
    difficulty: 'Intermediate',
    durationMinutes: 45,
    xpReward: 250,
    status: 'in-progress',
    dueAt: null
  },
  {
    id: 'm8',
    skillId: 'skill_8',
    title: 'Hash Collision Arena',
    description: 'Compare linear probing, quadratic probing, and chaining under high load factor.',
    type: 'lab',
    difficulty: 'Intermediate',
    durationMinutes: 30,
    xpReward: 250,
    status: 'available',
    dueAt: null
  },
  {
    id: 'm9',
    skillId: 'skill_9',
    title: 'Adjacency List Construction',
    description: 'Build a space-efficient graph representation for 10,000 vertices.',
    type: 'lab',
    difficulty: 'Intermediate',
    durationMinutes: 35,
    xpReward: 280,
    status: 'available',
    dueAt: null
  },
  {
    id: 'm10',
    skillId: 'skill_10',
    title: 'Asymptotic Analysis Suite',
    description: 'Determine exact Big-O complexities for nested loops and recurrence relations.',
    type: 'quiz',
    difficulty: 'Intermediate',
    durationMinutes: 30,
    xpReward: 300,
    status: 'available',
    dueAt: null
  },
  {
    id: 'm11',
    skillId: 'skill_11',
    title: 'Knapsack 0/1 Memoization',
    description: 'Solve the 0/1 Knapsack problem using top-down memoization and bottom-up DP table.',
    type: 'project',
    difficulty: 'Advanced',
    durationMinutes: 50,
    xpReward: 350,
    status: 'locked',
    dueAt: null
  },
  {
    id: 'm12',
    skillId: 'skill_12',
    title: 'Huffman Code Generator',
    description: 'Construct optimal prefix codes using a priority queue greedy strategy.',
    type: 'project',
    difficulty: 'Advanced',
    durationMinutes: 45,
    xpReward: 350,
    status: 'locked',
    dueAt: null
  },
  {
    id: 'm13',
    skillId: 'skill_13',
    title: 'Min-Heap Priority Queue',
    description: 'Implement heapify-up and heapify-down in a binary heap.',
    type: 'lab',
    difficulty: 'Advanced',
    durationMinutes: 40,
    xpReward: 380,
    status: 'locked',
    dueAt: null
  },
  {
    id: 'm14',
    skillId: 'skill_14',
    title: 'Dijkstra Shortest Path',
    description: 'Find shortest paths in weighted graphs using Dijkstra with Min-Heap.',
    type: 'project',
    difficulty: 'Advanced',
    durationMinutes: 50,
    xpReward: 400,
    status: 'locked',
    dueAt: null
  },
  {
    id: 'm15',
    skillId: 'skill_15',
    title: 'Space Complexity Refactoring',
    description: 'Optimize dynamic programming space complexity from O(N^2) to O(N).',
    type: 'project',
    difficulty: 'Advanced',
    durationMinutes: 45,
    xpReward: 450,
    status: 'locked',
    dueAt: null
  },
  {
    id: 'm16',
    skillId: 'skill_16',
    title: 'Cardinal Skill Capstone',
    description: 'Design and optimize a real-time routing engine combining all core course outcomes.',
    type: 'project',
    difficulty: 'Advanced',
    durationMinutes: 60,
    xpReward: 500,
    status: 'locked',
    dueAt: null
  }
]

export const prototypeAchievements: Achievement[] = [
  {
    id: 'a1',
    title: 'First Spark',
    description: 'Mastered your first skill in Cardinal Skill.',
    unlockedAt: '2026-07-28T10:00:00Z',
    rarity: 'common'
  },
  {
    id: 'a2',
    title: 'Foundation Builder',
    description: 'Mastered all Foundations branch skills.',
    unlockedAt: '2026-08-01T14:30:00Z',
    rarity: 'rare'
  },
  {
    id: 'a3',
    title: 'Tree Explorer',
    description: 'Master the Trees branch and complete all BST challenges.',
    unlockedAt: null,
    rarity: 'epic'
  },
  {
    id: 'a4',
    title: '7-Day Momentum',
    description: 'Maintain a 7-day active study streak.',
    unlockedAt: '2026-08-03T09:15:00Z',
    rarity: 'rare'
  }
]

export const prototypeAnalytics: AnalyticsStudent[] = [
  { id: 'st1', name: 'Alex Rivera', mastered: 6, progress: 38, streak: 9, status: 'on-track' },
  { id: 'st2', name: 'Bianca Santos', mastered: 9, progress: 56, streak: 12, status: 'on-track' },
  { id: 'st3', name: 'Christian Cruz', mastered: 4, progress: 25, streak: 3, status: 'needs-support' },
  { id: 'st4', name: 'Diana Mendoza', mastered: 12, progress: 75, streak: 14, status: 'on-track' },
  { id: 'st5', name: 'Ethan Reyes', mastered: 3, progress: 18, streak: 1, status: 'needs-support' }
]

export const prototypeData: PrototypeData = {
  user: {
    id: 'usr_alex',
    name: 'Alex Rivera',
    email: 'alex.rivera@mymail.mapua.edu.ph',
    studentNumber: '2024109821',
    program: 'BS Computer Science',
    yearLevel: 2,
    role: 'student',
    xp: 2840,
    level: 6,
    xpToNextLevel: 4000,
    streakDays: 9
  },
  skills: prototypeSkills,
  missions: prototypeMissions,
  achievements: prototypeAchievements,
  analytics: prototypeAnalytics
}
