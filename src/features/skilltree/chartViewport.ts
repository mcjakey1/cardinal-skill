/**
 * The chart's camera: where the canvas sits and how far in it is zoomed.
 *
 * The chart is an unbounded surface you move around, not a page that scrolls to
 * its ends — so nothing here clamps the offset. Panning past the last node into
 * open ground is allowed on purpose, because that is the space a new node gets
 * dragged into.
 *
 * One transform, applied once to the layer holding the whole graph:
 *
 *     screen = world * scale + offset
 *
 * Keeping it to that single formula is what makes `zoomAbout` solvable, and
 * `zoomAbout` is the function a pan/zoom surface usually gets wrong — zoom that
 * does not hold the point under the cursor makes the chart slide away from
 * whatever you were looking at.
 *
 * Pure and dependency-free, same contract as `progression.ts`.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Transform extends Point {
  scale: number;
}

/**
 * Below the floor the labels stop being readable; above the ceiling a cell is
 * bigger than a phone. Neither is a view worth offering.
 */
export const MIN_SCALE = 0.35;
export const MAX_SCALE = 2.5;

/** Breathing room around the content when the chart is fitted to the viewport. */
export const FIT_PAD = 48;

const num = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function toScreen(world: Point, t: Transform): Point {
  return { x: world.x * t.scale + t.x, y: world.y * t.scale + t.y };
}

export function toWorld(screen: Point, t: Transform): Point {
  const scale = t.scale || 1;
  return { x: (screen.x - t.x) / scale, y: (screen.y - t.y) / scale };
}

/**
 * The box every point sits in, grown by `pad`.
 *
 * An empty chart returns a unit box rather than the `Infinity` that `Math.min`
 * of nothing produces — that value would reach `fitTransform`, divide, and put
 * the whole canvas at a NaN offset where nothing renders and nothing explains
 * why.
 */
export function boundsOf(points: readonly Point[], pad = 0): Bounds {
  if (!points || points.length === 0) {
    return { minX: -pad, minY: -pad, maxX: pad || 1, maxY: pad || 1 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const x = num(p?.x);
    const y = num(p?.y);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/**
 * Put the whole chart on screen, centred.
 *
 * This is what "fit" does and what the chart opens on, so a student sees the
 * shape of their course rather than its top-left corner.
 */
export function fitTransform(bounds: Bounds, viewport: Viewport, pad = FIT_PAD): Transform {
  const width = Math.max(1, num(bounds.maxX) - num(bounds.minX));
  const height = Math.max(1, num(bounds.maxY) - num(bounds.minY));

  // The first render happens before `onLayout` has measured anything, so a zero
  // viewport is the normal starting state rather than an error.
  const vw = Math.max(1, num(viewport?.width));
  const vh = Math.max(1, num(viewport?.height));

  const usableW = Math.max(1, vw - pad * 2);
  const usableH = Math.max(1, vh - pad * 2);
  const scale = clampScale(Math.min(usableW / width, usableH / height));

  return {
    scale,
    x: (vw - width * scale) / 2 - num(bounds.minX) * scale,
    y: (vh - height * scale) / 2 - num(bounds.minY) * scale,
  };
}

/**
 * Zoom by `factor` while holding one screen point still.
 *
 * The clamp is applied *before* the offset is solved. Doing it after is the
 * subtle version of the bug: at the ceiling the scale stops changing but the
 * offset does not, so the chart creeps sideways on every further scroll.
 */
export function zoomAbout(t: Transform, factor: number, focus: Point): Transform {
  const scale = clampScale(num(t.scale, 1) * num(factor, 1));
  const world = toWorld(focus, t);
  return {
    scale,
    x: num(focus.x) - world.x * scale,
    y: num(focus.y) - world.y * scale,
  };
}
