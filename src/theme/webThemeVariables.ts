import type { ThemePalette } from './themes';

/** Semantic browser chrome values derived from the active app palette. */
export function webThemeVariables(theme: ThemePalette): Readonly<Record<string, string>> {
  return {
    '--csk-ground': theme.background,
    '--csk-ink': theme.textPrimary,
    '--csk-focus': theme.nodeActive.border,
    '--csk-track': theme.hudBackground,
    '--csk-track-edge': theme.border,
    '--csk-thumb': theme.edgeCompleted,
    '--csk-thumb-hover': theme.edgeActive,
    '--csk-selection': theme.navActiveTab,
    '--csk-selection-ink': theme.nodeActive.icon,
  };
}
