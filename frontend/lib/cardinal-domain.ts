export type UserRole = 'student' | 'instructor'
export type SkillStatus = 'mastered' | 'active' | 'available' | 'locked'
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
  courseId: string
  title: string
  shortTitle: string
  description: string
  status: SkillStatus
  progress: number
  xpReward: number
  position: { x: number; y: number }
  prerequisites: string[]
  missionIds: string[]
  icon: 'code' | 'database' | 'network' | 'shield' | 'brain' | 'terminal'
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
  progress: number
  mastered: number
  streak: number
  status: 'on-track' | 'needs-support' | 'excelling'
}

export interface CardinalRepository {
  getCurrentUser(): Promise<UserProfile>
  getCourses(): Promise<Course[]>
  getSkills(courseId: string): Promise<SkillNode[]>
  getMissions(): Promise<Mission[]>
  getAchievements(): Promise<Achievement[]>
  getInstructorAnalytics(): Promise<AnalyticsStudent[]>
  updateMissionStatus(id: string, status: MissionStatus): Promise<{ ok: true }>
}
