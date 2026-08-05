export type UserRole = 'student' | 'instructor'
export type SkillStatus = 'locked' | 'available' | 'in_progress' | 'mastered'
export type MissionStatus = 'completed' | 'in-progress' | 'available' | 'locked'
/** Same set the syllabus parser emits and `@shared/types` stores. */
export type NodeKind = 'topic' | 'reading' | 'assignment' | 'assessment' | 'project'

export interface UserProfile {
  id: string
  name: string
  email: string
  studentNumber: string
  program: string
  yearLevel: number
  role: UserRole
  level: number
  xp: number
  xpToNextLevel: number
  streakDays: number
}

export interface SkillNode {
  id: string
  title: string
  shortTitle?: string
  description?: string
  status: SkillStatus
  difficulty?: number
  difficultyLabel?: 'Foundational' | 'Intermediate' | 'Advanced'
  learningObjective?: string
  estimatedMinutes?: number
  moduleName?: string
  xpReward?: number
  progress?: number
  prerequisiteIds: string[]
  missionIds?: string[]
  category?: string
  /** What kind of work the node is. The AI parser sets it; so does the manual editor. */
  kind?: NodeKind
  icon?: 'code' | 'database' | 'network' | 'shield' | 'brain' | 'terminal'
  position?: { x: number; y: number }
  /** Set on a supplemental help step: the syllabus skill it scaffolds. */
  parentNodeId?: string | null
  /**
   * False on a supplemental help step. Mirrors `graded` on the shared node
   * type — the grade boundary lives on this flag, so anything that reports what
   * a course is worth filters on it rather than guessing from `parentNodeId`.
   */
  graded?: boolean
}

export interface SkillTreePayload {
  course: {
    id: string
    code: string
    title: string
  }
  nodes: SkillNode[]
}

export interface Mission {
  id: string
  skillId: string
  title: string
  description: string
  type: 'quiz' | 'lab' | 'project' | 'reflection'
  difficulty: 'Foundational' | 'Intermediate' | 'Advanced'
  durationMinutes: number
  xpReward: number
  status: MissionStatus
  dueAt: string | null
}

export interface Course {
  id: string
  code: string
  title: string
  term: string
  instructor: string
  progress: number
  masteredSkills: number
  totalSkills: number
}

export interface Achievement {
  id: string
  title: string
  description: string
  unlockedAt: string | null
  rarity: 'common' | 'rare' | 'epic'
}

/**
 * One node's generated names, plus any title an instructor typed over them.
 *
 * The first four fields are exactly the columns `supabase/functions/name-quest`
 * writes. The two override fields stand in for its `title_override` column —
 * the thing that makes the function skip a node instead of renaming it.
 */
export interface QuestNaming {
  nodeId: string
  title: string
  subtitle: string
  achievementTitle: string
  achievementDescription: string
  titleOverride?: string | null
  achievementTitleOverride?: string | null
}

export interface AnalyticsStudent {
  id: string
  name: string
  mastered: number
  progress: number
  streak: number
  status: 'on-track' | 'needs-support'
}
