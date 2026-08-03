export interface UserTreeLayout {
  userId: string
  courseId: string
  version: number
  updatedAt: string
  positions: Record<string, { x: number; y: number }>
}

export interface TreeLayoutStorageAdapter {
  loadLayout(userId: string, courseId: string): UserTreeLayout | null
  saveLayout(layout: UserTreeLayout): void
  clearLayout(userId: string, courseId: string): void
}

const LAYOUT_VERSION = 1
const KEY_PREFIX = 'cardinal-skill:tree-layout'

function getStorageKey(userId: string, courseId: string): string {
  return `${KEY_PREFIX}:${userId}:${courseId}`
}

export const localStorageTreeLayoutAdapter: TreeLayoutStorageAdapter = {
  loadLayout(userId: string, courseId: string): UserTreeLayout | null {
    if (typeof window === 'undefined') return null
    try {
      const key = getStorageKey(userId, courseId)
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const parsed: UserTreeLayout = JSON.parse(raw)
      if (!parsed || parsed.version !== LAYOUT_VERSION || !parsed.positions) {
        return null
      }
      return parsed
    } catch {
      return null
    }
  },

  saveLayout(layout: UserTreeLayout): void {
    if (typeof window === 'undefined') return
    try {
      const key = getStorageKey(layout.userId, layout.courseId)
      localStorage.setItem(key, JSON.stringify(layout))
    } catch (e) {
      console.warn('Failed to save tree layout to localStorage:', e)
    }
  },

  clearLayout(userId: string, courseId: string): void {
    if (typeof window === 'undefined') return
    try {
      const key = getStorageKey(userId, courseId)
      localStorage.removeItem(key)
    } catch (e) {
      console.warn('Failed to clear tree layout from localStorage:', e)
    }
  }
}
