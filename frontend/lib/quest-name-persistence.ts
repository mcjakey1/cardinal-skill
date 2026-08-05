import type { QuestNaming } from './cardinal-domain'

export type QuestNameMap = Record<string, QuestNaming>

const STORAGE_KEY_PREFIX = 'cardinal-skill:quest-names'

/**
 * Generated quest names and the instructor titles typed over them.
 *
 * Same adapter shape as `profile-persistence` and `tree-layout-persistence`:
 * one key per user, JSON in, JSON out, every failure falls back to empty rather
 * than throwing. In the real app these are columns on `skill_nodes`, written by
 * the `name-quest` Edge Function and read back with the tree.
 */
export const questNameStorageAdapter = {
  loadNames(userId: string): QuestNameMap {
    if (typeof window === 'undefined') return {}
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}:${userId}`)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? (parsed as QuestNameMap) : {}
    } catch {
      return {}
    }
  },

  saveNames(userId: string, names: QuestNameMap): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}:${userId}`, JSON.stringify(names))
    } catch (e) {
      console.warn('Failed to save quest names to localStorage:', e)
    }
  }
}

/**
 * True once an instructor has typed either title by hand.
 *
 * `name-quest` filters these nodes out of the batch and re-checks the column at
 * write time, so an override survives a regeneration that was already in
 * flight. This is the client half of that promise.
 */
export function hasNameOverride(naming?: QuestNaming | null): boolean {
  return Boolean(naming?.titleOverride || naming?.achievementTitleOverride)
}
