export interface StudentProfile {
  id: string
  fullName: string
  universityEmail: string
  studentNumber: string
  program: string
  yearLevel: string
  campus: string
  studyPace: string
  avatarUrl?: string | null
}

export const defaultProfile: StudentProfile = {
  id: 'usr_alex',
  fullName: 'Alex Rivera',
  universityEmail: 'alex.rivera@mymail.mapua.edu.ph',
  studentNumber: '2024109821',
  program: 'BS Computer Science',
  yearLevel: '2',
  campus: 'Mapúa Intramuros',
  studyPace: 'Balanced (5 days/wk)'
}

const STORAGE_KEY_PREFIX = 'cardinal-skill:profile'

export const profileStorageAdapter = {
  loadProfile(userId: string): StudentProfile {
    if (typeof window === 'undefined') return defaultProfile
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}:${userId}`)
      if (!raw) return defaultProfile
      const parsed = JSON.parse(raw)
      return { ...defaultProfile, ...parsed }
    } catch {
      return defaultProfile
    }
  },

  saveProfile(userId: string, profile: StudentProfile): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}:${userId}`, JSON.stringify(profile))
    } catch (e) {
      console.warn('Failed to save profile to localStorage:', e)
    }
  }
}
