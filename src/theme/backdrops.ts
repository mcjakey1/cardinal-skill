/**
 * What the skill tree canvas sits on.
 *
 * The palette decides the colours; this decides the *material* underneath the
 * nodes — a dither gradient, a blueprint grid, scanlines, or a picture the
 * student chose. It is a per-device preference, not course data, so it lives
 * beside the theme preset rather than in Postgres.
 *
 * DESIGN.md's No-Blend Rule still holds: every pattern here is drawn from whole
 * palette entries on the 2dp dither cell, never an interpolated tone. An image
 * is the one thing that arrives with tones of its own, and it is dimmed with a
 * Bayer scrim rather than an alpha ramp for the same reason.
 *
 * Renderer: `src/ui/Backdrop.tsx`.
 */

import type { DitherLevel } from './dither';

/**
 * No `solid` here on purpose. Every chart preset maps both endpoints of
 * `theme.field` to its own background — see the note in `src/ui/Dither.tsx` —
 * so `field` already *is* the flat one, and a second chip drawing the identical
 * screen is how a picker teaches a student that none of it works.
 */
export const BACKDROP_IDS = [
  'field',
  'gradient',
  'grid',
  'dots',
  'scanlines',
  'diagonal',
  'image',
] as const;

export type BackdropId = (typeof BACKDROP_IDS)[number];

/** Picker copy. Sentence case, names the thing the student is choosing. */
export const BACKDROP_LABELS: Record<BackdropId, string> = {
  field: 'Canvas field',
  gradient: 'Dither gradient',
  grid: 'Blueprint grid',
  dots: 'Dot matrix',
  scanlines: 'Scanlines',
  diagonal: 'Diagonal weave',
  image: 'Your image',
};

export interface Backdrop {
  id: BackdropId;
  /** The student's picture, or null when they have not chosen one. */
  imageUri: string | null;
  /** Bayer level of the scrim over that picture: 0 shows it raw, 16 hides it. */
  dim: DitherLevel;
}

/** `field` is what the chart drew before this setting existed. */
export const DEFAULT_BACKDROP: Backdrop = { id: 'field', imageUri: null, dim: 6 };

/** The scrim steps offered in the picker, densest last. */
export const DIM_STEPS: readonly { value: DitherLevel; label: string }[] = [
  { value: 0, label: 'None' },
  { value: 4, label: 'Light' },
  { value: 8, label: 'Half' },
  { value: 12, label: 'Heavy' },
];

/**
 * Tile edge in dp for the repeating patterns. Multiples of the 2dp dither cell.
 *
 * The tile is what sets each pattern's coverage, and coverage is what decides
 * whether it reads as texture or as noise. A 2dp mark on a 32dp grid tile is a
 * blueprint; the same mark on an 8dp tile is a dot screen; a 2dp line every
 * 12dp is a scanline. Widen a tile and the pattern disappears — that is how the
 * first cut of this shipped with a dot every 16dp, which nobody could see.
 */
export const PATTERN_TILE = {
  grid: 32,
  dots: 8,
  scanlines: 12,
  diagonal: 16,
} as const;

export type PatternId = keyof typeof PATTERN_TILE;

/**
 * The colour a pattern is drawn in, over `palette.background`.
 *
 * Here rather than in the renderer so a test can hold every preset to it.
 * `border` was the first choice and failed at 1.7:1 on Emerald Terminal — drawn
 * correctly, invisible on the screen. `textMuted` is the palette's only mid
 * tone, and at these coverages it reads as texture, not as a second surface.
 */
export function patternInk(palette: { textMuted: string }): string {
  return palette.textMuted;
}

export interface PatternCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One tile of each pattern, as whole 2dp cells.
 *
 * Rectangles rather than lines or circles, and every edge on the cell grid, so
 * nothing here is anti-aliased into an in-between tone the palette does not
 * have. The diagonal is a stair for the same reason a diagonal was a stair on
 * the machines this grammar comes from.
 */
export function patternCells(id: PatternId): PatternCell[] {
  const cell = 2;
  const tile = PATTERN_TILE[id];
  switch (id) {
    case 'grid':
      return [
        { x: 0, y: 0, width: cell, height: tile },
        { x: 0, y: 0, width: tile, height: cell },
      ];
    case 'dots':
      return [{ x: tile / 2 - cell, y: tile / 2 - cell, width: cell, height: cell }];
    case 'scanlines':
      return [{ x: 0, y: 0, width: tile, height: cell }];
    case 'diagonal':
      return Array.from({ length: tile / cell }, (_, step) => ({
        x: step * cell,
        y: tile - cell - step * cell,
        width: cell,
        height: cell,
      }));
  }
}

/**
 * Where a picture is allowed to come from: an `https` link, or the picture
 * itself inline.
 *
 * Deliberately *not* the local schemes a picker hands back — `file://`,
 * `content://`, `ph://`, `blob:`. Those name a place on one device, so a
 * backdrop stored as one would be a broken image on the student's other two.
 * A picked photo is inlined instead, and travels with the account.
 *
 * `javascript:` and a bare `http` link a network can rewrite are refused for
 * the older reason: this string is typed by a person and handed to a loader.
 */
const ALLOWED_SCHEME = /^(https:\/\/|data:image\/)/i;

/**
 * The ceiling on an inlined picture, per platform.
 *
 * On a device, AsyncStorage is SQLite and starts failing on entries past a
 * couple of megabytes. On the web it is `localStorage`, which is about 5MB for
 * the whole origin and counts UTF-16 code units — so a 2,000,000-character data
 * URI is 4MB of a store this app also keeps its session, prefs and course cache
 * in. The write throws `QuotaExceededError`, and the only honest place to say
 * so is before the student picks the photo, not after.
 *
 * 700,000 characters is ~1.4MB there, which leaves the rest of the origin room
 * to breathe. A JPEG at the picker's half quality is usually well inside it.
 */
export const MAX_IMAGE_URI = 2_000_000;
export const MAX_IMAGE_URI_WEB = 700_000;

export function imageLimitFor(platform: 'web' | 'native'): number {
  return platform === 'web' ? MAX_IMAGE_URI_WEB : MAX_IMAGE_URI;
}

export type ImageUriCheck =
  | { ok: true; uri: string }
  | { ok: false; reason: string };

export function checkImageUri(raw: string, limit: number = MAX_IMAGE_URI): ImageUriCheck {
  const uri = raw.trim();
  if (!uri) return { ok: false, reason: 'Paste a link or choose a photo first.' };
  if (uri.length > limit) {
    return {
      ok: false,
      reason: 'That photo is too large to carry to your other devices. Choose a smaller one, or paste a link to it.',
    };
  }
  if (!ALLOWED_SCHEME.test(uri)) {
    return { ok: false, reason: 'Use an https link, or choose a photo from this device.' };
  }
  return { ok: true, uri };
}

export function isBackdropId(value: unknown): value is BackdropId {
  return typeof value === 'string' && (BACKDROP_IDS as readonly string[]).includes(value);
}

function clampDim(value: unknown): DitherLevel {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_BACKDROP.dim;
  return Math.max(0, Math.min(16, Math.round(value)));
}

/**
 * Read a stored preference back. Storage is a trust boundary like any other:
 * an older build, a half-written write, or a hand-edited value all land here,
 * and none of them should be able to stop the chart drawing.
 */
export function parseBackdrop(raw: unknown): Backdrop {
  if (typeof raw === 'string') {
    try {
      return parseBackdrop(JSON.parse(raw));
    } catch {
      return DEFAULT_BACKDROP;
    }
  }
  if (!raw || typeof raw !== 'object') return DEFAULT_BACKDROP;
  const stored = raw as Partial<Backdrop>;
  const checked = typeof stored.imageUri === 'string' ? checkImageUri(stored.imageUri) : null;
  const imageUri = checked?.ok ? checked.uri : null;
  const id = isBackdropId(stored.id) ? stored.id : DEFAULT_BACKDROP.id;
  return {
    // A picture that failed its check leaves nothing to draw, so fall back to
    // the field rather than a blank canvas.
    id: id === 'image' && !imageUri ? DEFAULT_BACKDROP.id : id,
    imageUri,
    dim: clampDim(stored.dim),
  };
}
