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

  // ---------------------------------------------------------------- light set
  //
  // Two entries added for the light theme, under the escape hatch the Sixteen
  // Rule writes for itself: a genuine addition lands here and in DESIGN.md in
  // the same change.
  //
  // Neither could be borrowed from the sixteen. Every existing light entry is
  // cool (`bone` is pink-grey), and the ground the student asked for is warm.
  // And `periwinkle` measures 3.6:1 on that ground — it carries "the machine is
  // telling you something", so on light it needed a darker twin rather than a
  // reassignment to red, which would have borrowed the colour that means
  // "do this next".

  /** 10 · The light theme's ground. Warm, so the screen reads as paper. */
  cream: '#F5EFE3',
  /** 11 · Periwinkle for a light ground. 6.98:1 on cream; same hue family. */
  indigo: '#4A3FB0',
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

// ---------------------------------------------------------------------- themes

/**
 * Two renditions of one grammar.
 *
 * The sixteen-colour world was authored on a dark ground, and for a while that
 * *was* the design. It is now the option rather than the given: a student reading
 * between classes in daylight gets paper, and a student reading at night gets the
 * lit screen. Nothing else changes — same square corners, same 2dp bevels, same
 * ordered dither, same one typeface, same three-way status encoding.
 *
 * What could not simply invert is worth naming, because it is where a careless
 * light mode goes wrong:
 *
 *   `brass` is 1.98:1 on a light ground. Mastered is the most important earned
 *   state in the product, so on light it moves to `umber` — brass in shadow —
 *   and keeps the metal family through its gold bevel.
 *
 *   `haze` is 2.33:1 on light and cannot set text there. `slate` takes secondary
 *   text instead, at 6.76:1. DESIGN.md's Slate-Is-Not-Ink Rule was measured on
 *   `void`, where slate is 2.46:1 — the rule is about a ground, not about slate.
 *
 *   `blush` is the dark theme's focus ring at 3.09:1 on cardinal. On cream it is
 *   nearly white, so light focus is `cardinal`.
 */
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

export interface Theme {
  scheme: Scheme;
  /** The screen with nothing on it. */
  ground: string;
  /** A raised surface: panels, window frames, nav cells. */
  panel: string;
  /** An inset surface: window bodies, input wells. */
  well: string;
  /** Primary text. */
  ink: string;
  /** Secondary text. Always ≥4.5:1 on `ground`, `panel` and `well`. */
  inkMuted: string;
  /** Hairlines, dividers, cell outlines. Never text. */
  line: string;
  brand: string;
  brandInk: string;
  /** "The machine is telling you something" — log lines and links. */
  info: string;
  /** Mastered: the meter, cleared cells, walked edges, earned stamps. */
  earned: string;
  /** Ink that sits on an `earned` surface. */
  earnedInk: string;
  /** Earned as *text*, on `ground` or `panel`. */
  earnedText: string;
  /** An error line. */
  alarm: string;
  /** Focus ring, and the outline on the recommended next node. */
  focus: string;
  /** Chart ground dither: [base, laid over]. */
  field: readonly [string, string];
  /** A locked cell's fill dither: [base, laid over]. */
  lockField: readonly [string, string];
  /** Secondary screens use a quieter field than the chart. */
  quietField: readonly [string, string];
  tone: Record<'panel' | 'brand' | 'earned' | 'ink', BevelTone>;
  node: Record<'locked' | 'available' | 'mastered', NodeVisual>;
}

export const darkTheme: Theme = {
  scheme: 'dark',
  ground: palette.void,
  panel: palette.oxblood,
  well: palette.abyss,
  ink: palette.bone,
  inkMuted: palette.haze,
  line: palette.slate,
  brand: palette.cardinal,
  brandInk: palette.bone,
  info: palette.periwinkle,
  earned: palette.brass,
  earnedInk: palette.abyss,
  earnedText: palette.gold,
  alarm: palette.rose,
  focus: palette.blush,
  field: [palette.wine, palette.cardinal],
  lockField: [palette.void, palette.wine],
  quietField: [palette.void, palette.wine],
  tone: {
    panel: { fill: palette.oxblood, light: palette.wine, dark: palette.void, ink: palette.bone },
    brand: { fill: palette.cardinal, light: palette.rose, dark: palette.blood, ink: palette.bone },
    earned: { fill: palette.brass, light: palette.gold, dark: palette.umber, ink: palette.abyss },
    ink: { fill: palette.abyss, light: palette.oxblood, dark: palette.void, ink: palette.bone },
  },
  node: nodeStyle,
};

export const lightTheme: Theme = {
  scheme: 'light',
  ground: palette.cream,
  panel: palette.white,
  well: palette.bone,
  ink: palette.void,
  inkMuted: palette.slate,
  line: palette.slate,
  brand: palette.cardinal,
  brandInk: palette.white,
  info: palette.indigo,
  earned: palette.umber,
  earnedInk: palette.gold,
  earnedText: palette.umber,
  alarm: palette.blood,
  focus: palette.cardinal,
  // The light field runs cream -> bone, so its densest band is `bone` and every
  // mark on it is measured against that: cardinal 4.91:1, umber 11.96:1, slate
  // 6.76:1, void labels 16.66:1. Dithering toward `haze` gave a better texture
  // and put an available cell at 2.11:1 on its own field, which is the whole
  // point of the chart failing.
  field: [palette.cream, palette.bone],
  lockField: [palette.bone, palette.haze],
  quietField: [palette.cream, palette.bone],
  tone: {
    panel: { fill: palette.white, light: palette.white, dark: palette.haze, ink: palette.void },
    brand: { fill: palette.cardinal, light: palette.rose, dark: palette.blood, ink: palette.white },
    earned: { fill: palette.umber, light: palette.brass, dark: palette.void, ink: palette.gold },
    ink: { fill: palette.bone, light: palette.haze, dark: palette.white, ink: palette.void },
  },
  node: {
    locked: {
      fill: palette.bone,
      edge: palette.slate,
      light: palette.white,
      dark: palette.haze,
      ink: palette.void,
      glyph: 'lock',
      label: 'Locked',
    },
    available: {
      fill: palette.cardinal,
      edge: palette.blood,
      light: palette.rose,
      dark: palette.blood,
      ink: palette.white,
      glyph: 'play',
      label: 'Available',
    },
    mastered: {
      fill: palette.umber,
      edge: palette.void,
      light: palette.brass,
      dark: palette.void,
      ink: palette.gold,
      glyph: 'check',
      label: 'Mastered',
    },
  },
};

export const themes: Record<Scheme, Theme> = { light: lightTheme, dark: darkTheme };
