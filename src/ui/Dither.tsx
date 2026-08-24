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

import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import {
  DITHER_CELL as CELL,
  DITHER_TILE as TILE,
  ditherFill,
  ditherId,
  fieldLevels,
  instanceNamespace,
  litCells,
  type DitherLevel,
} from '@/theme/dither';
import { useTheme } from '@/theme/useTheme';

// The threshold matrix and the level maths moved to `@/theme/dither` when the
// instructor workspace started drawing the same field on the web. Re-exported
// here so every existing import keeps working.
export { ditherFill, ditherId, litCells };

/**
 * A namespace of this component's own.
 *
 * Every caller needs one. On the web these definitions are document-wide, and
 * this app leaves inactive routes mounted, so a shared name means one screen
 * draws another screen's colours and loses its own the moment that screen goes
 * away. See `instanceNamespace` for the whole story.
 */
function useDitherNamespace(prefix: string): string {
  const id = useId();
  return instanceNamespace(prefix, id);
}
export type { DitherLevel };

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
  /**
   * `chart` is the full-strength field the skill tree sits on; `quiet` is the
   * calmer one every other screen uses. Both come from the theme, so neither
   * caller has to know whether it is drawing on paper or on a lit screen.
   */
  variant?: 'chart' | 'quiet';
  /** Base colour, the one showing through the unlit cells. Overrides `variant`. */
  from?: string;
  /** Dithered colour, densest at the top. Overrides `variant`. */
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
 * A preset field built out of dither bands. Chart presets currently map both
 * endpoints to their canvas background for a stable, flash-free solid field;
 * quiet screens may retain a subtle surface texture.
 */
export function DitherField({ variant = 'chart', from, to, bands = 9, flat = false }: FieldProps) {
  const theme = useTheme();
  const name = useDitherNamespace('field');
  const [baseColour, overColour] = variant === 'quiet' ? theme.quietField : theme.field;
  const base = from ?? baseColour;
  const over = to ?? overColour;
  const levels = fieldLevels(bands);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        {flat ? null : <DitherDefs name={name} colour={over} levels={levels} />}
        {/* Flat mode keeps the dominant colour, not the base one: the field
            should still read as itself when the texture is gone. */}
        <Rect x="0" y="0" width="100%" height="100%" fill={flat ? over : base} />
        {flat
          ? null
          : levels.map((level, i) => (
              <Rect
                key={i}
                x="0"
                y={`${(i * 100) / bands}%`}
                width="100%"
                height={`${100 / bands + 0.5}%`}
                fill={ditherFill(name, level)}
              />
            ))}
      </Svg>
    </View>
  );
}
