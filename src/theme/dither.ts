/**
 * Ordered (Bayer) dithering — the material rule, with no renderer attached.
 *
 * DESIGN.md's No-Blend Rule says every intermediate tone in this product is a
 * 4×4 ordered dither of two palette entries, never an interpolated one. That
 * rule now has two renderers: `src/ui/Dither.tsx` draws it with react-native-svg
 * for the student app, and the instructor workspace's authoring canvas draws it
 * with plain SVG on the web.
 *
 * The threshold matrix lives here so those two never drift into disagreeing
 * about what "level 6" looks like.
 */

/** Cell size in dp. The pattern tile is 4 cells square. */
export const DITHER_CELL = 2;
export const DITHER_TILE = DITHER_CELL * 4;

/** Bayer 4×4 threshold matrix. Cell (x, y) lights when its value < level. */
export const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

/** The 17 levels: 0 lights nothing, 16 lights everything. */
export type DitherLevel = number;

export function litCells(level: DitherLevel): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (BAYER[y]![x]! < level) cells.push({ x: x * DITHER_CELL, y: y * DITHER_CELL });
    }
  }
  return cells;
}

/**
 * A namespace unique to one mounted component, from React's `useId`.
 *
 * This exists because of a bug worth remembering. On the web these patterns
 * become real DOM, `fill="url(#id)"` resolves to the *first* matching id in the
 * document, and this app keeps inactive routes mounted on purpose — see the
 * `freezeOnBlur` note in `app/_layout.tsx`. Every field used to declare itself
 * as `csk-field-N`, so a screen drew whichever screen mounted first, and the
 * moment that screen unmounted every other screen's fill pointed at nothing and
 * its background vanished.
 *
 * `useId` returns `:r3:` or `«r3»` depending on the renderer, and an XML id is
 * an NCName: no colons, and it may not start with a digit. Hence the scrub.
 */
export function instanceNamespace(prefix: string, instanceId: string): string {
  const scrubbed = instanceId.replace(/[^A-Za-z0-9]/g, '');
  return `${prefix}-${scrubbed || 'x'}`;
}

/** Stable id for one dither pattern, so a fill can reference it by name. */
export function ditherId(name: string, level: DitherLevel): string {
  return `csk-${name}-${level}`;
}

export function ditherFill(name: string, level: DitherLevel): string {
  return `url(#${ditherId(name, level)})`;
}

/**
 * The levels for a field cut into `bands` steps, densest first. Both renderers
 * build their gradient from this, so a field of 9 bands is the same field in
 * either app.
 */
export function fieldLevels(bands: number): DitherLevel[] {
  return Array.from({ length: bands }, (_, i) =>
    Math.round(16 - (i * 15) / Math.max(bands - 1, 1)),
  );
}
