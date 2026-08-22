/**
 * The screen's component vocabulary: text, bevels, controls, and icons.
 *
 * Three rules run through all of it.
 *
 * **Depth is an edge, not a shadow.** A raised control is lit on its top-left
 * and dark on its bottom-right, one bevel wide. Pressing it swaps the two, which
 * is the whole press animation — instant, because a bevel that eases is a bevel
 * that lies about being a physical key.
 *
 * **Icons are drawn, never typed.** Each one below is a bitmap authored on an
 * 8×8 grid and rendered as rects, so it is the same object at any size and in
 * any palette colour. No glyph font, no emoji.
 *
 * **Nothing here names a colour.** Every value comes from the resolved theme, so
 * one component draws correctly on paper and on the lit screen. A raw `palette.`
 * reference in this file is how one control ends up dark in a light app.
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
import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, space, touch, type, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// ----------------------------------------------------------------------- text

type Variant = keyof typeof type;

interface PixelTextProps extends TextProps {
  variant?: Variant;
  colour?: string;
  centred?: boolean;
}

export function PixelText({ variant = 'body', colour, centred, style, ...rest }: PixelTextProps) {
  const t = useTheme();
  return (
    <Text
      style={[type[variant], { color: colour ?? t.ink }, centred && styles.centred, style]}
      {...rest}
    />
  );
}

// --------------------------------------------------------------------- bevels

export type Tone = keyof Theme['tone'];

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
 *
 * Takes the theme rather than reading it from context, so it stays usable inside
 * a `StyleSheet` callback and in the style array of a `Pressable`.
 */
export function bevelStyle(
  theme: Theme,
  tone: Tone,
  depth: 'raised' | 'inset',
  hollow = false,
): ViewStyle & TextStyle {
  const t = theme.tone[tone];
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
  const t = useTheme();
  return <View style={[bevelStyle(t, tone, depth, hollow), style]} {...rest} />;
}

/**
 * react-native-web hands the style callback a `hovered` flag that React Native's
 * own types do not declare. The cast lives here rather than at each call site,
 * and it is simply absent on iOS and Android, where there is no pointer to hover
 * with — which is the correct behaviour, not a gap.
 */
export type PressState = { pressed: boolean; hovered?: boolean };

/**
 * A pointer resting on a key lights it.
 *
 * The era this interface is drawn from had no hover, so this is a modern
 * affordance and it is kept to the one move the grammar already owns: the fill
 * becomes the tone's lit shade, the same colour its top-left bevel is already
 * using. No new colour, no shadow, no transition — a lit key or an unlit one.
 */
export function hoverFill(theme: Theme, tone: Tone, hovered?: boolean): ViewStyle | null {
  return hovered ? { backgroundColor: theme.tone[tone].light } : null;
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
  { label, tone = 'brand', grow = true, disabled, style, ...rest },
  ref,
) {
  const t = useTheme();
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed, hovered }: PressState) => [
        styles.button,
        bevelStyle(t, disabled ? 'panel' : tone, pressed ? 'inset' : 'raised'),
        disabled || pressed ? null : hoverFill(t, tone, hovered),
        grow ? styles.grow : null,
        style,
      ]}
      {...rest}
    >
      <PixelText
        variant="label"
        colour={disabled ? t.inkMuted : t.tone[tone].ink}
        centred
      >
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
  const t = useTheme();
  return (
    <View style={styles.field}>
      <PixelText variant="micro" colour={t.inkMuted}>
        {label.toUpperCase()}
      </PixelText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.inkMuted}
        multiline={multiline}
        style={[
          bevelStyle(t, 'ink', 'inset'),
          styles.input,
          { color: t.ink },
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
  const t = useTheme();
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
              bevelStyle(t, active ? 'brand' : 'panel', active ? 'inset' : 'raised'),
            ]}
          >
            <PixelText variant="micro" colour={active ? t.tone.brand.ink : t.inkMuted}>
              {side}
            </PixelText>
          </View>
        );
      })}
    </Pressable>
  );
}

/**
 * The same two-cell switch, widened to a row of named choices. Used where a
 * setting has three states rather than two — theme, for one, which has to carry
 * "follow the device" alongside the two it can be pinned to.
 */
export function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <View style={styles.toggle} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={option.label}
            style={[
              styles.toggleCell,
              bevelStyle(t, active ? 'brand' : 'panel', active ? 'inset' : 'raised'),
            ]}
          >
            <PixelText variant="micro" colour={active ? t.tone.brand.ink : t.inkMuted}>
              {option.label.toUpperCase()}
            </PixelText>
          </Pressable>
        );
      })}
    </View>
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
export function Meter({ value, cells = 12, colour, label }: MeterProps) {
  const { theme } = useAppTheme();
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
          style={[
            styles.meterCell,
            {
              backgroundColor: i < lit ? (colour ?? theme.xpBarFill) : theme.xpBarBackground,
            },
          ]}
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
  /** Half lit, half dark — the switch between paper and a lit screen. */
  contrast: [
    '..####..',
    '.##...#.',
    '##....##',
    '##....##',
    '###...##',
    '####..##',
    '.#####..',
    '..####..',
  ],
  minus: [
    '........',
    '........',
    '........',
    '.######.',
    '.######.',
    '........',
    '........',
    '........',
  ],
  plus: [
    '........',
    '...##...',
    '...##...',
    '.######.',
    '.######.',
    '...##...',
    '...##...',
    '........',
  ],
  /** Crop marks: everything pulled inside one frame. */
  fit: [
    '###..###',
    '#......#',
    '#......#',
    '........',
    '........',
    '#......#',
    '#......#',
    '###..###',
  ],
  /**
   * Back the way it was.
   *
   * The head starts hard against the left edge and the shaft runs well past the
   * middle. Centred with a short shaft — the first attempt at this — the two
   * strokes read as a cross, not an arrow.
   */
  undo: [
    '........',
    '..#.....',
    '.##.....',
    '#######.',
    '.##.....',
    '..#.....',
    '........',
    '........',
  ],
} as const;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  colour?: string;
}

export function PixelIcon({ name, size = 16, colour }: IconProps) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 8 8">
      {ICONS[name].map((row, y) =>
        row.split('').map((cell, x) =>
          cell === '#' ? (
            <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colour ?? t.ink} />
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
  const t = useTheme();
  const s = t.node[status];
  const ink =
    status === 'locked' ? t.inkMuted : status === 'mastered' ? t.earnedText : t.ink;
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
