/**
 * Design tokens. The only place raw hex, font names, or spacing numbers live.
 * See DESIGN.md for what each choice means and why.
 *
 * Colour never carries meaning alone — node status is also encoded by shape and
 * a text label, so the chart is readable without colour vision.
 */

export const palette = {
  /** Chart ground. Navy, not black — the atlas is printed on blue paper. */
  ink: '#0B1622',
  inkRaised: '#132234',
  /** Engraved hairlines, locked nodes, dividers. */
  slate: '#46596E',
  /** Secondary text on ink. Passes AA at 16px on `ink`. */
  haze: '#93A6BC',
  /** Primary text on ink; surface colour in light mode. */
  parchment: '#EEF2F6',
  /** The single accent. Reserved for the meridian and the current objective. */
  cardinal: '#C4123F',
  cardinalDim: '#7A0F2A',
  /** Mastered nodes. Differs from cardinal in hue *and* value. */
  brass: '#C8A15A',
  /** Status feedback. Not used for node state. */
  warning: '#E0A030',
  danger: '#D4453C',
} as const;

export const font = {
  /** Wide grotesk. Chart titles and section headings only, never body copy. */
  display: 'ArchivoExpanded_700Bold',
  body: 'PublicSans_400Regular',
  bodyMedium: 'PublicSans_500Medium',
  /** Marginalia: XP counts, node codes, timestamps. */
  mono: 'IBMPlexMono_400Regular',
} as const;

/** Type scale. Ratio 1.25, rounded to whole pixels. */
export const type = {
  eyebrow: { fontFamily: font.mono, fontSize: 11, letterSpacing: 1.6, lineHeight: 16 },
  caption: { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 24 },
  title: { fontFamily: font.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  display: { fontFamily: font.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.6 },
} as const;

/** 4px base grid. */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 } as const;

export const radius = { sm: 4, md: 8, pill: 999 } as const;

/** Motion. Every duration here must be skipped when reduce-motion is on. */
export const motion = {
  /** Constellation line drawing in as a node unlocks. */
  unlock: 400,
  /** Press feedback, sheet transitions. */
  quick: 160,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

/** Node status → visual treatment. Shape is load-bearing, not decorative. */
export const nodeStyle = {
  locked: { fill: 'transparent', stroke: palette.slate, sides: 6, label: 'Locked' },
  available: { fill: palette.cardinal, stroke: palette.cardinal, sides: 0, label: 'Available' },
  mastered: { fill: palette.brass, stroke: palette.brass, sides: 4, label: 'Mastered' },
} as const;
