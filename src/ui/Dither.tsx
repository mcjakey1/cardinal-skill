/**
 * Ordered dithering — the material this interface is made of.
 *
 * A sixteen-colour screen has no in-between tone, so every intermediate value is
 * a 4×4 ordered (Bayer) dither of two palette colours. This is the real
 * algorithm, not a texture pretending to be one: `litCells(level)` returns
 * exactly the cells a Bayer threshold would light, which is why two adjacent
 * bands interlock instead of banding.
 *
 * The dither cell is 2dp. On a 3x phone that is ~0.3mm, which is about what one
 * pixel measured on the CRTs this grammar comes from — coarse enough to read as
 * texture, fine enough not to read as a checkerboard.
 */

import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { palette } from '@/theme/tokens';

/** Cell size in dp. The pattern tile is 4 cells square. */
const CELL = 2;
const TILE = CELL * 4;

/** Bayer 4×4 threshold matrix. Cell (x, y) lights when its value < level. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** The 17 levels: 0 lights nothing, 16 lights everything. */
export type DitherLevel = number;

export function litCells(level: DitherLevel): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (BAYER[y]![x]! < level) cells.push({ x: x * CELL, y: y * CELL });
    }
  }
  return cells;
}

/** Stable id for one dither pattern, so a fill can reference it by name. */
export function ditherId(name: string, level: DitherLevel): string {
  return `csk-${name}-${level}`;
}

export function ditherFill(name: string, level: DitherLevel): string {
  return `url(#${ditherId(name, level)})`;
}

interface DefsProps {
  /** Namespace, so two dithers of different colour pairs never collide. */
  name: string;
  /** The colour laid over the base. */
  colour: string;
  levels: DitherLevel[];
}

/**
 * Pattern definitions to drop inside an `<Svg>`. Kept separate from the fields
 * below so the chart can dither its own nodes with the same tiles.
 */
export function DitherDefs({ name, colour, levels }: DefsProps) {
  return (
    <Defs>
      {levels.map((level) => (
        <Pattern
          key={level}
          id={ditherId(name, level)}
          patternUnits="userSpaceOnUse"
          width={TILE}
          height={TILE}
        >
          {litCells(level).map((c, i) => (
            <Rect key={i} x={c.x} y={c.y} width={CELL} height={CELL} fill={colour} />
          ))}
        </Pattern>
      ))}
    </Defs>
  );
}

interface FieldProps {
  /** Base colour, the one showing through the unlit cells. */
  from?: string;
  /** Dithered colour, densest at the top. */
  to?: string;
  /** How many bands the gradient is cut into. */
  bands?: number;
  /**
   * Low-bandwidth mode renders one flat fill instead of the pattern tiles. The
   * chart is designed so this loses texture and nothing else.
   */
  flat?: boolean;
}

/**
 * The chart ground: a vertical gradient built entirely out of dither bands,
 * densest at the top. Absolutely positioned behind its siblings.
 */
export function DitherField({
  from = palette.wine,
  to = palette.cardinal,
  bands = 9,
  flat = false,
}: FieldProps) {
  const levels = Array.from({ length: bands }, (_, i) =>
    Math.round(16 - (i * 15) / Math.max(bands - 1, 1)),
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        {flat ? null : <DitherDefs name="field" colour={to} levels={levels} />}
        {/* Flat mode keeps the dominant colour, not the base one: the field
            should still read as cardinal when the texture is gone. */}
        <Rect x="0" y="0" width="100%" height="100%" fill={flat ? to : from} />
        {flat
          ? null
          : levels.map((level, i) => (
              <Rect
                key={i}
                x="0"
                y={`${(i * 100) / bands}%`}
                width="100%"
                height={`${100 / bands + 0.5}%`}
                fill={ditherFill('field', level)}
              />
            ))}
      </Svg>
    </View>
  );
}
