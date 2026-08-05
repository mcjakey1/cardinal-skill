/**
 * The screen's component vocabulary: text, bevels, controls, and icons.
 *
 * Two rules run through all of it.
 *
 * **Depth is an edge, not a shadow.** A raised control is lit on its top-left
 * and dark on its bottom-right, one bevel wide. Pressing it swaps the two, which
 * is the whole press animation — instant, because a bevel that eases is a bevel
 * that lies about being a physical key.
 *
 * **Icons are drawn, never typed.** Each one below is a bitmap authored on an
 * 8×8 grid and rendered as rects, so it is the same object at any size and in
 * any palette colour. No glyph font, no emoji.
 */

import { forwardRef } from 'react';
import {
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import type { NodeStatus } from '@/features/skilltree/types';
import { bevel, nodeStyle, palette, space, touch, type } from '@/theme/tokens';

// ----------------------------------------------------------------------- text

type Variant = keyof typeof type;

interface PixelTextProps extends TextProps {
  variant?: Variant;
  colour?: string;
  centred?: boolean;
}

export function PixelText({
  variant = 'body',
  colour = palette.bone,
  centred,
  style,
  ...rest
}: PixelTextProps) {
  return (
    <Text
      style={[type[variant], { color: colour }, centred && styles.centred, style]}
      {...rest}
    />
  );
}

// --------------------------------------------------------------------- bevels

type Tone = 'panel' | 'cardinal' | 'brass' | 'ink';

const TONES: Record<Tone, { fill: string; light: string; dark: string }> = {
  panel: { fill: palette.oxblood, light: palette.wine, dark: palette.void },
  cardinal: { fill: palette.cardinal, light: palette.rose, dark: palette.blood },
  brass: { fill: palette.brass, light: palette.gold, dark: palette.umber },
  ink: { fill: palette.abyss, light: palette.oxblood, dark: palette.void },
};

interface BevelProps extends ViewProps {
  tone?: Tone;
  /** `raised` reads as a key to press; `inset` as a well to read out of. */
  depth?: 'raised' | 'inset';
  /** Suppress the fill so a bevel can frame something already painted. */
  hollow?: boolean;
}

/**
 * Returned as both a view and a text style: the bevel is nothing but border
 * properties, which both accept, and a field needs the same edge a panel has.
 */
export function bevelStyle(
  tone: Tone,
  depth: 'raised' | 'inset',
  hollow = false,
): ViewStyle & TextStyle {
  const t = TONES[tone];
  const light = depth === 'raised' ? t.light : t.dark;
  const dark = depth === 'raised' ? t.dark : t.light;
  return {
    borderTopWidth: bevel,
    borderLeftWidth: bevel,
    borderRightWidth: bevel,
    borderBottomWidth: bevel,
    borderTopColor: light,
    borderLeftColor: light,
    borderRightColor: dark,
    borderBottomColor: dark,
    backgroundColor: hollow ? 'transparent' : t.fill,
  };
}

export function Bevel({ tone = 'panel', depth = 'raised', hollow, style, ...rest }: BevelProps) {
  return <View style={[bevelStyle(tone, depth, hollow), style]} {...rest} />;
}

// -------------------------------------------------------------------- buttons

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  tone?: Tone;
  /** Full width is the default; a row of two buttons opts out. */
  grow?: boolean;
  style?: ViewStyle;
}

export const PixelButton = forwardRef<View, ButtonProps>(function PixelButton(
  { label, tone = 'cardinal', grow = true, disabled, style, ...rest },
  ref,
) {
  const ink = tone === 'brass' ? palette.abyss : palette.bone;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        bevelStyle(disabled ? 'panel' : tone, pressed ? 'inset' : 'raised'),
        grow ? styles.grow : null,
        style,
      ]}
      {...rest}
    >
      <PixelText variant="label" colour={disabled ? palette.haze : ink} centred>
        {label}
      </PixelText>
    </Pressable>
  );
});

// ---------------------------------------------------------------------- input

interface InputProps extends TextInputProps {
  label: string;
}

/** A field is a well: the bevel runs inset, so it reads as somewhere to put something. */
export function PixelInput({ label, style, multiline, ...rest }: InputProps) {
  return (
    <View style={styles.field}>
      <PixelText variant="micro" colour={palette.haze}>
        {label.toUpperCase()}
      </PixelText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.haze}
        multiline={multiline}
        style={[
          bevelStyle('ink', 'inset'),
          styles.input,
          multiline ? styles.inputTall : null,
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

// --------------------------------------------------------------------- toggle

/**
 * A switch drawn the way this screen draws switches: two cells, the active one
 * pressed in. Both states are labelled, so the setting reads correctly with the
 * colour removed.
 */
export function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      style={styles.toggle}
    >
      {(['ON', 'OFF'] as const).map((side) => {
        const on = side === 'ON';
        const active = on === value;
        return (
          <View
            key={side}
            style={[
              styles.toggleCell,
              bevelStyle(active ? 'cardinal' : 'panel', active ? 'inset' : 'raised'),
            ]}
          >
            <PixelText variant="micro" colour={active ? palette.bone : palette.haze}>
              {side}
            </PixelText>
          </View>
        );
      })}
    </Pressable>
  );
}

// ---------------------------------------------------------------------- meter

interface MeterProps {
  /** 0–1. Clamped, because an XP total can outrun its level ceiling. */
  value: number;
  cells?: number;
  colour?: string;
  label: string;
}

/**
 * Progress as lit cells, never a smooth bar. Sixteen colours cannot draw a
 * smooth bar, and a segmented meter reads faster at a glance anyway.
 */
export function Meter({ value, cells = 12, colour = palette.brass, label }: MeterProps) {
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const lit = Math.round(clamped * cells);
  return (
    <View
      style={styles.meter}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      {Array.from({ length: cells }, (_, i) => (
        <View
          key={i}
          style={[styles.meterCell, { backgroundColor: i < lit ? colour : palette.oxblood }]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------- icons

/** 8×8 bitmaps. `#` lights a cell; everything else is transparent. */
const ICONS = {
  check: [
    '........',
    '.......#',
    '......##',
    '.#...##.',
    '.##.##..',
    '..####..',
    '...##...',
    '........',
  ],
  play: [
    '..#.....',
    '..##....',
    '..###...',
    '..####..',
    '..###...',
    '..##....',
    '..#.....',
    '........',
  ],
  lock: [
    '..####..',
    '.##..##.',
    '.##..##.',
    '########',
    '##....##',
    '##.##.##',
    '##.##.##',
    '########',
  ],
  close: [
    '........',
    '.##..##.',
    '..####..',
    '...##...',
    '..####..',
    '.##..##.',
    '........',
    '........',
  ],
  chart: [
    '##....##',
    '##....##',
    '.######.',
    '....#...',
    '.######.',
    '##....##',
    '##....##',
    '........',
  ],
  stack: [
    '########',
    '#......#',
    '########',
    '#......#',
    '########',
    '#......#',
    '########',
    '........',
  ],
  stamp: [
    '..####..',
    '.######.',
    '##.##.##',
    '########',
    '##....##',
    '.######.',
    '..####..',
    '........',
  ],
  gear: [
    '..#..#..',
    '.######.',
    '.##..##.',
    '##....##',
    '##....##',
    '.##..##.',
    '.######.',
    '..#..#..',
  ],
  upload: [
    '...##...',
    '..####..',
    '.######.',
    '...##...',
    '...##...',
    '........',
    '########',
    '########',
  ],
} as const;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  colour?: string;
}

export function PixelIcon({ name, size = 16, colour = palette.bone }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 8 8">
      {ICONS[name].map((row, y) =>
        row.split('').map((cell, x) =>
          cell === '#' ? (
            <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colour} />
          ) : null,
        ),
      )}
    </Svg>
  );
}

// --------------------------------------------------------------------- status

/**
 * Status as a glyph plus its word. Both, always — this is the second and third
 * encoding that keeps status off colour alone.
 */
export function StatusTag({ status, compact }: { status: NodeStatus; compact?: boolean }) {
  const s = nodeStyle[status];
  const ink = status === 'locked' ? palette.haze : status === 'mastered' ? palette.gold : palette.bone;
  return (
    <View style={styles.status}>
      <PixelIcon name={s.glyph as IconName} size={12} colour={ink} />
      {compact ? null : (
        <PixelText variant="micro" colour={ink}>
          {s.label.toUpperCase()}
        </PixelText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
  grow: { alignSelf: 'stretch' },
  button: {
    minHeight: touch,
    paddingHorizontal: space.md,
    paddingVertical: space.cell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { gap: space.xs },
  input: {
    ...type.body,
    color: palette.bone,
    minHeight: touch,
    paddingHorizontal: space.cell,
    paddingVertical: space.cell,
  },
  inputTall: { minHeight: 120, textAlignVertical: 'top' },
  toggle: { flexDirection: 'row', minHeight: touch, alignItems: 'stretch' },
  toggleCell: {
    minWidth: 56,
    paddingHorizontal: space.cell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meter: { flexDirection: 'row', gap: space.hair },
  meterCell: { width: 8, height: 10 },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
