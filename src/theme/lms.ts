/**
 * Tokens for the instructor surface — the deliberately conventional half.
 *
 * These implement the instructor section of `DESIGN.md`, the brief for this surface
 * and the reason it does not look like the rest of the app. Do not blend the two
 * token sets: `tokens.ts` is a sixteen-colour screen with 2dp bevels and square
 * corners, this is a warm institutional workspace with hairlines and 5px
 * controls. A screen that mixes them belongs to neither.
 *
 * The one exception is deliberate and documented over there: the authoring
 * canvas draws in the student's grammar, from `tokens.ts`, because an instructor
 * needs to see the artifact as it ships.
 *
 * Every contrast ratio in the comments below was measured in that document; the
 * values are copied, not re-derived.
 */

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * ponytail: the brief names DM Sans. Nothing in this repo loads it, and pulling
 * `@expo-google-fonts/dm-sans` in to set the chrome of one screen buys a
 * download and a font-loading gate for a face most people cannot name. The
 * platform UI face is the same kind of face and is already there. Swap this for
 * the real family if the brand face starts mattering.
 *
 * Web needs the stack spelled out: `+html.tsx` sets DotGothic16 on `body`, and
 * an undefined family there inherits the pixel face instead of the system one.
 */
const face =
  Platform.OS === 'web'
    ? '"DM Sans", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'
    : undefined;

const colour = {
  /** The page. */
  ground: '#f7f3ea',
  /** Panels, tables, the rail, the topbar. */
  surface: '#fffdf8',
  /** Table headers, segmented troughs, avatars. */
  surfaceSunk: '#efe6d8',
  /** Row and control hover. */
  surfaceHover: '#f4efe4',
  /** 14.64:1 on ground. All primary text. */
  ink: '#251f20',
  /** 5.93:1 on ground, 5.31:1 on surface. Secondary text, headers, hints. */
  inkMuted: '#645b5d',
  /** 7.40:1 on ground. Primary buttons, active nav, meter fill. */
  brand: '#981e2f',
  brandInk: '#fffdf8',
  /** Selected rows and active nav ground. */
  brandWash: '#f6eae9',
  brandHover: '#7f1826',
  /** Fill only — 2.29:1 on surface. It must never set text. */
  gold: '#d2a33a',
  /** 4.56:1. The ink for gold-toned content. */
  goldInk: '#8a6a1f',
  goldWash: '#f7efdc',
  /** 5.82:1. On track, valid. */
  ok: '#1f6b4a',
  okWash: '#e6f0ea',
  /** 5.34:1. Needs support, suppression notice. */
  attention: '#8a5a12',
  attentionWash: '#f7efe0',
  attentionLine: '#e2cfa8',
  errorLine: '#e8c9c9',
  /** Decorative hairline. Dividers and panel edges. */
  line: '#ded4c4',
  /** 3.39:1 on ground. Every boundary a user must actually see. */
  lineStrong: '#8f8270',
} as const;

const type = {
  /** One per screen. */
  page: { fontFamily: face, fontSize: 24, lineHeight: 32, fontWeight: '600', letterSpacing: -0.24 },
  /** Panel and group headings. */
  section: { fontFamily: face, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  /** The default. */
  body: { fontFamily: face, fontSize: 14, lineHeight: 20 },
  /** Table cells, controls, inspector values. */
  small: { fontFamily: face, fontSize: 13, lineHeight: 18 },
  /** Column headers, labels, legends. */
  micro: {
    fontFamily: face,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.48,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TextStyle>;

/**
 * One lift, with an offset *and* a blur. A zero-offset coloured halo is
 * decoration and is not used. Android takes `elevation`; the other two platforms
 * take the shadow quartet, so both are set.
 */
const lift: ViewStyle = {
  shadowColor: '#251f20',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.09,
  shadowRadius: 3,
  elevation: 1,
};

export const lms = {
  colour,
  type,
  lift,
  /** 4/8/12/16/24/32, the vertical rhythm the brief sets. */
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const,
  /** Hairline elements, controls, panels, badges. Nothing square, nothing round. */
  radius: { xs: 3, sm: 5, md: 8, pill: 11 } as const,
  /** Fixed rail width, sticky topbar height, and where the rail becomes a drawer. */
  rail: 244,
  topbar: 52,
  wide: 860,
  /**
   * The narrowest a data table may be drawn. Below this the columns stop being
   * readable, so the table scrolls sideways inside the panel instead.
   */
  tableMin: 620,
  /** Minimum touch target, same floor the student app keeps. */
  touch: 44,
} as const;
