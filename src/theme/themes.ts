import type { Theme } from './tokens';

export interface ThemePalette {
  id: string;
  name: string;
  background: string;
  surface: string;
  surfaceHover: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  success: string;
  warning: string;
  danger: string;
  nodeCompleted: {
    background: string;
    border: string;
    icon: string;
    glow?: string;
  };
  nodeActive: {
    background: string;
    border: string;
    icon: string;
    glow?: string;
  };
  nodeLocked: {
    background: string;
    border: string;
    icon: string;
  };
  edgeCompleted: string;
  edgeActive: string;
  edgeLocked: string;
  hudBackground: string;
  navActiveTab: string;
  xpBarFill: string;
  xpBarBackground: string;
}

export type ThemePresetId =
  | 'obsidian-blueprint'
  | 'cyber-neon'
  | 'emerald-terminal'
  | 'solar-warmth'
  | 'nord-frost';

export const DEFAULT_THEME_ID: ThemePresetId = 'obsidian-blueprint';

export const THEME_PRESETS = {
  'obsidian-blueprint': {
    id: 'obsidian-blueprint',
    name: 'Obsidian Blueprint',
    background: '#0B0F19',
    surface: '#111827',
    surfaceHover: '#1E293B',
    border: '#334155',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    success: '#86EFAC',
    warning: '#FDE68A',
    danger: '#FDA4AF',
    nodeCompleted: {
      background: '#1E293B', border: '#38BDF8', icon: '#38BDF8', glow: '#38BDF8',
    },
    nodeActive: {
      background: '#0284C7', border: '#E0F2FE', icon: '#FFFFFF', glow: '#38BDF8',
    },
    nodeLocked: { background: '#1E293B', border: '#334155', icon: '#64748B' },
    edgeCompleted: '#38BDF8',
    edgeActive: '#0284C7',
    edgeLocked: '#334155',
    hudBackground: '#111827',
    navActiveTab: '#0284C7',
    xpBarFill: '#38BDF8',
    xpBarBackground: '#334155',
  },
  'cyber-neon': {
    id: 'cyber-neon',
    name: 'Cyber Neon',
    background: '#100926',
    surface: '#190F38',
    surfaceHover: '#2B1055',
    border: '#3A2B68',
    textPrimary: '#FFF8FC',
    textSecondary: '#E9DDF7',
    textMuted: '#B9A7D8',
    success: '#00FFA3',
    warning: '#FFD166',
    danger: '#FF8FC8',
    nodeCompleted: {
      background: '#2B1055', border: '#00FFA3', icon: '#00FFA3', glow: '#00FFA3',
    },
    nodeActive: {
      background: '#E00070', border: '#FF70BA', icon: '#FFFFFF', glow: '#FF70BA',
    },
    nodeLocked: { background: '#1E1638', border: '#3A2B68', icon: '#6C599E' },
    edgeCompleted: '#00FFA3',
    edgeActive: '#E00070',
    edgeLocked: '#3A2B68',
    hudBackground: '#190F38',
    navActiveTab: '#E00070',
    xpBarFill: '#00FFA3',
    xpBarBackground: '#3A2B68',
  },
  'emerald-terminal': {
    id: 'emerald-terminal',
    name: 'Emerald Terminal',
    background: '#08140E',
    surface: '#0D2117',
    surfaceHover: '#133824',
    border: '#1B432E',
    textPrimary: '#F0FDF4',
    textSecondary: '#BBF7D0',
    textMuted: '#86B89A',
    success: '#86EFAC',
    warning: '#FDE68A',
    danger: '#FDA4AF',
    nodeCompleted: {
      background: '#133824', border: '#22C55E', icon: '#86EFAC', glow: '#22C55E',
    },
    nodeActive: {
      background: '#15803D', border: '#4ADE80', icon: '#FFFFFF', glow: '#4ADE80',
    },
    nodeLocked: { background: '#0E2419', border: '#1B432E', icon: '#3F6E54' },
    edgeCompleted: '#22C55E',
    edgeActive: '#4ADE80',
    edgeLocked: '#1B432E',
    hudBackground: '#0D2117',
    navActiveTab: '#15803D',
    xpBarFill: '#22C55E',
    xpBarBackground: '#1B432E',
  },
  'solar-warmth': {
    id: 'solar-warmth',
    name: 'Solar Warmth',
    background: '#1C1917',
    surface: '#292524',
    surfaceHover: '#3A302C',
    border: '#44403C',
    textPrimary: '#FAFAF9',
    textSecondary: '#E7E5E4',
    textMuted: '#A8A29E',
    success: '#86EFAC',
    warning: '#FDE68A',
    danger: '#FDA4AF',
    nodeCompleted: {
      background: '#451A03', border: '#F59E0B', icon: '#FDE68A', glow: '#F59E0B',
    },
    nodeActive: {
      background: '#EA580C', border: '#FDBA74', icon: '#FFFFFF', glow: '#FDBA74',
    },
    nodeLocked: { background: '#292524', border: '#44403C', icon: '#78716C' },
    edgeCompleted: '#F59E0B',
    edgeActive: '#EA580C',
    edgeLocked: '#44403C',
    hudBackground: '#292524',
    navActiveTab: '#EA580C',
    xpBarFill: '#F59E0B',
    xpBarBackground: '#44403C',
  },
  'nord-frost': {
    id: 'nord-frost',
    name: 'Nord Frost',
    background: '#2E3440',
    surface: '#3B4252',
    surfaceHover: '#434C5E',
    border: '#4C566A',
    textPrimary: '#ECEFF4',
    textSecondary: '#D8DEE9',
    textMuted: '#B8C1D1',
    success: '#A3BE8C',
    warning: '#EBCB8B',
    danger: '#F2A5AD',
    nodeCompleted: {
      background: '#434C5E', border: '#88C0D0', icon: '#ECEFF4', glow: '#88C0D0',
    },
    nodeActive: {
      background: '#5E81AC', border: '#81A1C1', icon: '#ECEFF4', glow: '#81A1C1',
    },
    nodeLocked: { background: '#3B4252', border: '#4C566A', icon: '#616E85' },
    edgeCompleted: '#88C0D0',
    edgeActive: '#5E81AC',
    edgeLocked: '#4C566A',
    hudBackground: '#3B4252',
    navActiveTab: '#5E81AC',
    xpBarFill: '#88C0D0',
    xpBarBackground: '#4C566A',
  },
} as const satisfies Record<ThemePresetId, ThemePalette>;

export const availableThemes: readonly ThemePalette[] = Object.values(THEME_PRESETS);

export function isThemePresetId(value: unknown): value is ThemePresetId {
  return typeof value === 'string' && value in THEME_PRESETS;
}

/**
 * Adapter for the established student component vocabulary. New chart and HUD
 * work consumes ThemePalette directly; the rest of the app continues to use
 * semantic roles while receiving the same preset values.
 */
export function toLegacyTheme(preset: ThemePalette): Theme {
  return {
    scheme: 'dark',
    ground: preset.background,
    panel: preset.surface,
    well: preset.surface,
    ink: preset.textPrimary,
    inkMuted: preset.textSecondary,
    line: preset.border,
    brand: preset.nodeActive.background,
    brandInk: preset.nodeActive.icon,
    info: preset.nodeCompleted.border,
    earned: preset.xpBarFill,
    earnedInk: preset.background,
    earnedText: preset.nodeCompleted.icon,
    success: preset.success,
    warning: preset.warning,
    alarm: preset.danger,
    focus: preset.nodeActive.border,
    field: [preset.background, preset.background],
    lockField: [preset.nodeLocked.background, preset.nodeLocked.border],
    quietField: [preset.background, preset.surface],
    tone: {
      panel: {
        fill: preset.surface,
        light: preset.surfaceHover,
        dark: preset.border,
        ink: preset.textPrimary,
      },
      brand: {
        fill: preset.nodeActive.background,
        light: preset.nodeActive.border,
        dark: preset.edgeActive,
        ink: preset.nodeActive.icon,
      },
      earned: {
        fill: preset.nodeCompleted.background,
        light: preset.nodeCompleted.border,
        dark: preset.background,
        ink: preset.nodeCompleted.icon,
      },
      ink: {
        fill: preset.background,
        light: preset.border,
        dark: preset.surface,
        ink: preset.textPrimary,
      },
    },
    node: {
      locked: {
        fill: preset.nodeLocked.background,
        edge: preset.nodeLocked.border,
        light: preset.border,
        dark: preset.background,
        ink: preset.nodeLocked.icon,
        glyph: 'lock',
        label: 'Locked',
      },
      available: {
        fill: preset.nodeActive.background,
        edge: preset.nodeActive.border,
        light: preset.nodeActive.border,
        dark: preset.edgeActive,
        ink: preset.nodeActive.icon,
        glyph: 'play',
        label: 'Available',
      },
      mastered: {
        fill: preset.nodeCompleted.background,
        edge: preset.nodeCompleted.border,
        light: preset.nodeCompleted.border,
        dark: preset.background,
        ink: preset.nodeCompleted.icon,
        glyph: 'check',
        label: 'Mastered',
      },
    },
  };
}
