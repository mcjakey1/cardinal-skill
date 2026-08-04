export type UserRole = 'student' | 'instructor'
export type SkillStatus = 'locked' | 'available' | 'in_progress' | 'mastered'
export type MissionStatus = 'completed' | 'in-progress' | 'available' | 'locked'

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
  icon?: 'code' | 'database' | 'network' | 'shield' | 'brain' | 'terminal'
  position?: { x: number; y: number }
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

export interface AnalyticsStudent {
  id: string
  name: string
  mastered: number
  progress: number
  streak: number
  status: 'on-track' | 'needs-support'
}
