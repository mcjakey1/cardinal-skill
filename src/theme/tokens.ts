/**
 * Design tokens. The only place raw hex, font names, or spacing numbers live.
 * See DESIGN.md for what each choice means and why.
 *
 * The interface is a sixteen-colour computer screen. That is not decoration: it
 * is a hard constraint that the rest of the system depends on. There are exactly
 * sixteen colours, indexed 00–0F, and **every intermediate tone is an ordered
 * dither of two of them, never a blend**. If a screen needs a colour that is not
 * in this table, the answer is a dither pair, not a seventeenth colour.
 *
 * Colour never carries meaning alone — node status is also encoded by a drawn
 * glyph and a text label, so the chart is readable without colour vision.
 */

/**
 * The locked palette. Index order is the palette order, darkest ground first,
 * so a dither pair is usually two adjacent entries.
 */
export const palette = {
  /** 00 · The screen with nothing lit on it. */
  void: '#0A0407',
  /** 01 · Window bodies and panel grounds. */
  abyss: '#16070E',
  /** 02 · Locked cell fill; the dark half of most ground dithers. */
  oxblood: '#2A0A16',
  /** 03 · The dark end of the field gradient. */
  wine: '#4A0E20',
  /** 04 · Cardinal in shadow. Bottom-right bevel on a red surface. */
  blood: '#7E0A28',
  /** 05 · Cardinal. The dominant colour of the product and the current objective. */
  cardinal: '#C4123F',
  /** 06 · Cardinal lit. Top-left bevel on a red surface. */
  rose: '#E8506B',
  /** 07 · The brightest red. Focus ring and the unlock flash, nothing else. */
  blush: '#FF9FB0',
  /** 08 · Brass in shadow. */
  umber: '#3A2410',
  /** 09 · Mastered. Differs from cardinal in hue *and* in value. */
  brass: '#C8A15A',
  /** 0A · Brass lit. */
  gold: '#E8C87A',
  /** 0B · Hairlines, dividers, and cell outlines. Never text — it fails contrast. */
  slate: '#5A4A55',
  /** 0C · Secondary text. 7:1 on `void`, so it is safe at every size. */
  haze: '#A794A0',
  /** 0D · Primary text. */
  bone: '#EDE7EA',
  /** 0E · The top-left highlight edge of a raised bevel. */
  white: '#FFFFFF',
  /** 0F · The one cool colour. Links, information, and the keyboard focus ring. */
  periwinkle: '#7A6BE8',
} as const;

export type PaletteColour = (typeof palette)[keyof typeof palette];

/**
 * Ordered dither pairs, by role. A dither is written as `[dark, light, level]`
 * where level 0–4 is how many of the four Bayer cells are lit.
 *
 * Four levels is not a limitation to work around — a 4×4 ordered dither at
 * screen scale is what gives the ground its texture, and a fifth level would
 * read as a flat fill.
 */
export const dither = {
  /** The chart ground, top to bottom: cardinal fading into wine. */
  field: [palette.wine, palette.cardinal] as const,
  /** Panel and window grounds. */
  panel: [palette.void, palette.oxblood] as const,
  /** A locked node's fill. Half density, so it reads as unavailable at a glance. */
  locked: [palette.void, palette.wine] as const,
} as const;

export const font = {
  /**
   * One face for the whole interface, because a sixteen-colour screen had one
   * font in ROM and everything on it was set in that font. DotGothic16 is a
   * modern outline face drawn on the 16-dot bitmap grid those screens used, so
   * it keeps the character while still scaling with the OS text-size setting.
   */
  screen: 'DotGothic16_400Regular',
} as const;

/**
 * Type scale. Sizes are multiples of the 4px cell so glyphs land on the grid;
 * line heights are multiples of 8 so consecutive lines do too.
 *
 * 12 is the floor. Below that a 16-dot face loses its counters, and the
 * accessibility floor would fail before the aesthetics did.
 */
export const type = {
  /** Marginalia: XP counts, levels, status words, node codes. */
  micro: { fontFamily: font.screen, fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  /** Everything a student reads in sentences. */
  body: { fontFamily: font.screen, fontSize: 16, lineHeight: 24 },
  /** Window title bars and control labels. */
  label: { fontFamily: font.screen, fontSize: 16, lineHeight: 24, letterSpacing: 1 },
  /** Screen headings. */
  title: { fontFamily: font.screen, fontSize: 20, lineHeight: 28, letterSpacing: 0.5 },
  /** One per screen at most. */
  display: { fontFamily: font.screen, fontSize: 32, lineHeight: 40 },
  /** The boot screen only. */
  hero: { fontFamily: font.screen, fontSize: 44, lineHeight: 52 },
} as const;

/** 8px cell, 4px half-cell. Every gap is one of these. */
export const space = { hair: 2, xs: 4, cell: 8, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/**
 * Bevel edge width. Two device-independent pixels, so the edge survives a 3x
 * screen without turning into a hairline nobody can see.
 */
export const bevel = 2;

/**
 * Minimum touch target. The visible mark is often smaller than this; the hit
 * area never is.
 */
export const touch = 44;

/** Motion. Every duration here is skipped when reduce-motion is on. */
export const motion = {
  /** The one authored moment: an edge draws in and its node lights up. */
  unlock: 400,
  /** The palette rotation that runs over the newly-opened cells. */
  flash: 320,
  /** Press feedback, window open. */
  quick: 120,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

/**
 * Node status → visual treatment.
 *
 * `glyph` is load-bearing, not decorative: it is the second encoding of status,
 * so the chart stays readable in greyscale and under every common form of colour
 * vision. `label` is the third, and it is what a screen reader announces.
 */
export const nodeStyle = {
  locked: {
    fill: palette.oxblood,
    edge: palette.slate,
    light: palette.wine,
    dark: palette.void,
    ink: palette.haze,
    glyph: 'lock',
    label: 'Locked',
  },
  available: {
    fill: palette.cardinal,
    edge: palette.blood,
    light: palette.rose,
    dark: palette.blood,
    ink: palette.bone,
    glyph: 'play',
    label: 'Available',
  },
  mastered: {
    fill: palette.brass,
    edge: palette.umber,
    light: palette.gold,
    dark: palette.umber,
    ink: palette.bone,
    glyph: 'check',
    label: 'Mastered',
  },
} as const;

export type NodeGlyph = (typeof nodeStyle)[keyof typeof nodeStyle]['glyph'];
