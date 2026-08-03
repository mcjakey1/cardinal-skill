import type { Achievement, AnalyticsStudent, CardinalRepository, Course, Mission, SkillNode, UserProfile } from './cardinal-domain'

const user: UserProfile = {
  id: 'usr_01',
  name: 'Alex Rivera',
  email: 'alex.rivera@mymail.mapua.edu.ph',
  studentNumber: '2023-10482',
  program: 'BS Computer Science',
  yearLevel: 2,
  role: 'student',
  level: 6,
  xp: 2840,
  xpToNextLevel: 4000,
  streakDays: 9
}

const courses: Course[] = [
  { id: 'crs_cs210', code: 'CS210', title: 'Data Structures & Algorithms', term: '2Q AY 2026–27', instructor: 'Prof. Mara Santos', progress: 68, masteredSkills: 6, totalSkills: 16 },
  { id: 'crs_cs230', code: 'CS230', title: 'Database Systems', term: '2Q AY 2026–27', instructor: 'Engr. Luis Flores', progress: 42, masteredSkills: 4, totalSkills: 12 },
  { id: 'crs_cs240', code: 'CS240', title: 'Computer Networks', term: '2Q AY 2026–27', instructor: 'Dr. Nina Cruz', progress: 31, masteredSkills: 3, totalSkills: 14 },
]

export const prototypeSkills: SkillNode[] = [
  {
    id: 'skill_1',
    courseId: 'crs_cs210',
    title: 'Computational Thinking',
    shortTitle: 'Computational Thinking',
    description: 'Decompose complex problems, recognize patterns, and formulate algorithmic solutions.',
    status: 'mastered',
    progress: 100,
    xpReward: 180,
    position: { x: 480, y: 70 },
    prerequisites: [],
    missionIds: ['mission_1'],
    icon: 'brain'
  },
  {
    id: 'skill_2',
    courseId: 'crs_cs210',
    title: 'Programming Foundations',
    shortTitle: 'Programming Foundations',
    description: 'Master core logic, variable scope, control structures, and functional execution.',
    status: 'mastered',
    progress: 100,
    xpReward: 200,
    position: { x: 320, y: 170 },
    prerequisites: ['skill_1'],
    missionIds: ['mission_2'],
    icon: 'code'
  },
  {
    id: 'skill_3',
    courseId: 'crs_cs210',
    title: 'Discrete Structures',
    shortTitle: 'Discrete Structures',
    description: 'Set theory, logic proofs, counting principles, and mathematical relations.',
    status: 'mastered',
    progress: 100,
    xpReward: 220,
    position: { x: 640, y: 170 },
    prerequisites: ['skill_1'],
    missionIds: ['mission_3'],
    icon: 'terminal'
  },
  {
    id: 'skill_4',
    courseId: 'crs_cs210',
    title: 'Linear Data Structures',
    shortTitle: 'Linear Data Structures',
    description: 'Arrays, linked lists, stacks, queues, and memory allocation strategies.',
    status: 'mastered',
    progress: 100,
    xpReward: 240,
    position: { x: 180, y: 280 },
    prerequisites: ['skill_2'],
    missionIds: ['mission_4'],
    icon: 'database'
  },
  {
    id: 'skill_5',
    courseId: 'crs_cs210',
    title: 'Recursion',
    shortTitle: 'Recursion',
    description: 'Base cases, recursive call stacks, divide-and-conquer strategy, and tree depth.',
    status: 'mastered',
    progress: 100,
    xpReward: 260,
    position: { x: 480, y: 280 },
    prerequisites: ['skill_2'],
    missionIds: ['mission_5'],
    icon: 'code'
  },
  {
    id: 'skill_6',
    courseId: 'crs_cs210',
    title: 'Sorting & Searching',
    shortTitle: 'Sorting & Searching',
    description: 'Binary search, merge sort, quicksort, and comparison complexity limits.',
    status: 'mastered',
    progress: 100,
    xpReward: 280,
    position: { x: 780, y: 280 },
    prerequisites: ['skill_3', 'skill_5'],
    missionIds: ['mission_6'],
    icon: 'terminal'
  },
  {
    id: 'skill_8',
    courseId: 'crs_cs210',
    title: 'Hashing',
    shortTitle: 'Hashing',
    description: 'Hash functions, collision resolution, chaining, open addressing, and load factor.',
    status: 'available',
    progress: 45,
    xpReward: 320,
    position: { x: 130, y: 400 },
    prerequisites: ['skill_4'],
    missionIds: ['mission_8'],
    icon: 'shield'
  },
  {
    id: 'skill_9',
    courseId: 'crs_cs210',
    title: 'Graph Theory',
    shortTitle: 'Graph Theory',
    description: 'Adjacency matrices, adjacency lists, directed graphs, and degree sequences.',
    status: 'available',
    progress: 30,
    xpReward: 340,
    position: { x: 340, y: 400 },
    prerequisites: ['skill_4'],
    missionIds: ['mission_9'],
    icon: 'network'
  },
  {
    id: 'skill_7',
    courseId: 'crs_cs210',
    title: 'Trees',
    shortTitle: 'Trees',
    description: 'Binary trees, BST operations, traversals, and node balancing fundamentals.',
    status: 'available',
    progress: 50,
    xpReward: 300,
    position: { x: 580, y: 400 },
    prerequisites: ['skill_5', 'skill_6'],
    missionIds: ['mission_7'],
    icon: 'database'
  },
  {
    id: 'skill_10',
    courseId: 'crs_cs210',
    title: 'Algorithm Analysis',
    shortTitle: 'Algorithm Analysis',
    description: 'Big-O, Big-Theta, Big-Omega notation, and asymptotic bounds evaluation.',
    status: 'available',
    progress: 0,
    xpReward: 360,
    position: { x: 830, y: 400 },
    prerequisites: ['skill_6'],
    missionIds: ['mission_10'],
    icon: 'brain'
  },
  {
    id: 'skill_11',
    courseId: 'crs_cs210',
    title: 'Dynamic Programming',
    shortTitle: 'Dynamic Programming',
    description: 'Memoization, tabulation, optimal substructure, and overlapping subproblems.',
    status: 'locked',
    progress: 0,
    xpReward: 380,
    position: { x: 130, y: 530 },
    prerequisites: ['skill_8', 'skill_10'],
    missionIds: ['mission_11'],
    icon: 'code'
  },
  {
    id: 'skill_12',
    courseId: 'crs_cs210',
    title: 'Greedy Algorithms',
    shortTitle: 'Greedy Algorithms',
    description: 'Greedy choice property, interval scheduling, and fractional knapsack solutions.',
    status: 'locked',
    progress: 0,
    xpReward: 400,
    position: { x: 340, y: 530 },
    prerequisites: ['skill_8', 'skill_10'],
    missionIds: ['mission_12'],
    icon: 'terminal'
  },
  {
    id: 'skill_13',
    courseId: 'crs_cs210',
    title: 'Advanced Trees',
    shortTitle: 'Advanced Trees',
    description: 'AVL trees, Red-Black trees, B-trees, and self-balancing BST rotations.',
    status: 'locked',
    progress: 0,
    xpReward: 420,
    position: { x: 580, y: 530 },
    prerequisites: ['skill_7', 'skill_9'],
    missionIds: ['mission_13'],
    icon: 'database'
  },
  {
    id: 'skill_14',
    courseId: 'crs_cs210',
    title: 'Graph Algorithms',
    shortTitle: 'Graph Algorithms',
    description: 'BFS, DFS, Dijkstra shortest path, Kruskal & Prim minimum spanning trees.',
    status: 'locked',
    progress: 0,
    xpReward: 440,
    position: { x: 830, y: 530 },
    prerequisites: ['skill_9'],
    missionIds: ['mission_14'],
    icon: 'network'
  },
  {
    id: 'skill_15',
    courseId: 'crs_cs210',
    title: 'Optimization',
    shortTitle: 'Optimization',
    description: 'Algorithm efficiency optimization, space-time tradeoffs, and bottleneck elimination.',
    status: 'locked',
    progress: 0,
    xpReward: 460,
    position: { x: 235, y: 660 },
    prerequisites: ['skill_11', 'skill_12'],
    missionIds: ['mission_15'],
    icon: 'shield'
  },
  {
    id: 'skill_16',
    courseId: 'crs_cs210',
    title: 'Capstone Mastery',
    shortTitle: 'Capstone Mastery',
    description: 'Comprehensive algorithmic synthesis and full-course mastery verification.',
    status: 'locked',
    progress: 0,
    xpReward: 500,
    position: { x: 580, y: 770 },
    prerequisites: ['skill_7', 'skill_13', 'skill_14', 'skill_15'],
    missionIds: ['mission_16'],
    icon: 'brain'
  }
]

const missions: Mission[] = prototypeSkills.slice(0, 12).map((skill, index) => ({
  id: `mission_${index + 1}`,
  skillId: skill.id,
  title: skill.id === 'skill_7' ? 'Binary Search Tree Expedition' : `${skill.title} Challenge`,
  description: `Complete an applied ${index % 3 === 0 ? 'lab' : 'assessment'} to demonstrate your understanding of ${skill.title.toLowerCase()}.`,
  type: index % 4 === 0 ? 'lab' : index % 4 === 1 ? 'quiz' : index % 4 === 2 ? 'project' : 'reflection',
  difficulty: index < 4 ? 'Foundational' : index < 9 ? 'Intermediate' : 'Advanced',
  durationMinutes: 20 + index * 5,
  xpReward: skill.xpReward,
  status: index < 6 ? 'completed' : index < 9 ? 'in-progress' : index < 12 ? 'available' : 'locked',
  dueAt: index < 6 ? null : `2026-08-${String(12 + index).padStart(2, '0')}T17:00:00.000Z`
}))

const achievements: Achievement[] = [
  { id: 'ach_1', title: 'First Spark', description: 'Master your first academic skill.', unlockedAt: '2026-06-08T10:00:00.000Z', rarity: 'common' },
  { id: 'ach_2', title: 'Nine-Day Flame', description: 'Maintain a nine-day learning streak.', unlockedAt: '2026-08-03T09:00:00.000Z', rarity: 'rare' },
  { id: 'ach_3', title: 'Tree Whisperer', description: 'Master every tree data structure skill.', unlockedAt: null, rarity: 'epic' },
  { id: 'ach_4', title: 'Peer Beacon', description: 'Help three classmates through a challenge.', unlockedAt: null, rarity: 'rare' },
]

const analytics: AnalyticsStudent[] = ['Alex Rivera', 'Bianca Lim', 'Carlos Mendoza', 'Diane Uy', 'Elijah Tan', 'Fatima Reyes'].map((name, i) => ({
  id: `student_${i + 1}`,
  name,
  progress: [68, 82, 39, 74, 91, 51][i],
  mastered: [6, 8, 3, 7, 10, 4][i],
  streak: [9, 12, 2, 7, 18, 4][i],
  status: i === 2 || i === 5 ? 'needs-support' : i === 4 ? 'excelling' : 'on-track'
}))

const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), 120))

export const cardinalRepository: CardinalRepository = {
  getCurrentUser: () => delay(user),
  getCourses: () => delay(courses),
  getSkills: () => delay(prototypeSkills),
  getMissions: () => delay(missions),
  getAchievements: () => delay(achievements),
  getInstructorAnalytics: () => delay(analytics),
  updateMissionStatus: () => delay({ ok: true as const })
}

export const prototypeData = { user, courses, skills: prototypeSkills, missions, achievements, analytics }
