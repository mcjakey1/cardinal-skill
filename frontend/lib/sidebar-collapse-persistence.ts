/**
 * Where the two collapse choices for the shell live.
 *
 * The sidebar rail and the chart details dock each stay how the student left
 * them across reloads — nothing about the chart itself changes, so there is
 * no versioning story to tell; a bad value silently falls back to the default.
 */

export type ShellCollapseState = {
  sidebarCollapsed: boolean
  detailsOpen: boolean
}

const KEY = 'cardinal-skill:shell-collapse:v1'

const DEFAULTS: ShellCollapseState = {
  // Default collapsed — the whole point of this shell is that the chart is the
  // hero. A student who wants the labelled nav can open it and it stays open.
  sidebarCollapsed: true,
  // Default closed — the chart is clean on first load; selecting a node brings
  // in the compact dock header first, and opening the panel is one click.
  detailsOpen: false
}

export const shellCollapseStorage = {
  load(): ShellCollapseState {
    if (typeof window === 'undefined') return DEFAULTS
    try {
      const raw = window.localStorage.getItem(KEY)
      if (!raw) return DEFAULTS
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return DEFAULTS
      return {
        sidebarCollapsed: typeof parsed.sidebarCollapsed === 'boolean' ? parsed.sidebarCollapsed : DEFAULTS.sidebarCollapsed,
        detailsOpen: typeof parsed.detailsOpen === 'boolean' ? parsed.detailsOpen : DEFAULTS.detailsOpen
      }
    } catch {
      return DEFAULTS
    }
  },
  save(state: ShellCollapseState): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // ponytail: silent. A shell-collapse preference lost is not a bug worth
      // a toast — the next click will save it again anyway.
    }
  }
}
