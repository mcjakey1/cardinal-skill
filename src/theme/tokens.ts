/**
 * Structural design tokens shared by every student preset. Palette values live
 * in themes.ts; components never choose a raw colour.
 */

export const font = {
  screen: 'DotGothic16_400Regular',
} as const;

export const type = {
  micro: { fontFamily: font.screen, fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  body: { fontFamily: font.screen, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: font.screen, fontSize: 16, lineHeight: 24, letterSpacing: 1 },
  title: { fontFamily: font.screen, fontSize: 20, lineHeight: 28, letterSpacing: 0.5 },
  display: { fontFamily: font.screen, fontSize: 32, lineHeight: 40 },
  hero: { fontFamily: font.screen, fontSize: 44, lineHeight: 52 },
} as const;

export const space = {
  hair: 2,
  xs: 4,
  cell: 8,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const bevel = 2;
export const touch = 44;

export const motion = {
  unlock: 400,
  flash: 320,
  quick: 120,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export type Scheme = 'light' | 'dark';

export interface BevelTone {
  fill: string;
  light: string;
  dark: string;
  ink: string;
}

export interface NodeVisual {
  fill: string;
  edge: string;
  light: string;
  dark: string;
  ink: string;
  glyph: string;
  label: string;
}

/**
 * Compatibility vocabulary for the established pixel components. It is
 * derived from ThemePalette by toLegacyTheme, never authored independently.
 */
export interface Theme {
  scheme: Scheme;
  ground: string;
  panel: string;
  well: string;
  ink: string;
  inkMuted: string;
  line: string;
  brand: string;
  brandInk: string;
  info: string;
  earned: string;
  earnedInk: string;
  earnedText: string;
  success: string;
  warning: string;
  /** Mission navigation accent, shared by locate controls and their chart pulse. */
  locate: string;
  locateInk: string;
  alarm: string;
  focus: string;
  field: readonly [string, string];
  lockField: readonly [string, string];
  quietField: readonly [string, string];
  tone: Record<'panel' | 'brand' | 'earned' | 'ink', BevelTone>;
  node: Record<'locked' | 'available' | 'mastered', NodeVisual>;
}
