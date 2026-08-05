/**
 * The chart's own controls, docked over the canvas.
 *
 * It floats above the surface it controls rather than sitting in the page,
 * because the canvas is unbounded — there is no edge for a toolbar to belong to.
 * That is the one place this interface allows something to overlap something
 * else, so it is kept to a single bevelled strip and never grows a second row.
 *
 * The toggle reads as a toggle without its colour: both states are spelled out,
 * matching `Toggle` in `pixel.tsx`.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import {
  Bevel,
  PixelIcon,
  PixelText,
  bevelStyle,
  hoverFill,
  type IconName,
  type PressState,
} from './pixel';

interface Props {
  movable: boolean;
  onToggleMovable: (next: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** Offered only once something has actually been moved. */
  onReset?: () => void;
  scale: number;
}

export function ChartTools({
  movable,
  onToggleMovable,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  scale,
}: Props) {
  const t = useTheme();

  return (
    <Bevel tone="panel" style={styles.bar}>
      <PixelText variant="micro" colour={t.inkMuted}>
        CHART
      </PixelText>

      <Pressable
        onPress={() => onToggleMovable(!movable)}
        accessibilityRole="switch"
        accessibilityState={{ checked: movable }}
        accessibilityLabel="Movable nodes"
        accessibilityHint={
          movable
            ? 'Nodes follow your finger. Turn off to drag the canvas instead.'
            : 'Dragging moves the canvas. Turn on to move nodes instead.'
        }
        style={styles.toggle}
      >
        <PixelText variant="micro" colour={t.inkMuted}>
          MOVABLE NODES
        </PixelText>
        <View style={styles.switch}>
          {(['ON', 'OFF'] as const).map((side) => {
            const active = (side === 'ON') === movable;
            return (
              <View
                key={side}
                style={[
                  styles.switchCell,
                  bevelStyle(t, active ? 'brand' : 'panel', active ? 'inset' : 'raised'),
                ]}
              >
                <PixelText variant="micro" colour={active ? t.brandInk : t.inkMuted}>
                  {side}
                </PixelText>
              </View>
            );
          })}
        </View>
      </Pressable>

      <View style={[styles.rule, { backgroundColor: t.line }]} />

      <Tool icon="minus" label="Zoom out" onPress={onZoomOut} />
      <PixelText variant="micro" colour={t.inkMuted}>
        {Math.round(scale * 100)}%
      </PixelText>
      <Tool icon="plus" label="Zoom in" onPress={onZoomIn} />
      <Tool icon="fit" label="Fit the whole chart on screen" onPress={onFit} />
      {onReset ? (
        <Tool icon="undo" label="Put nodes back where the syllabus put them" onPress={onReset} />
      ) : null}
    </Bevel>
  );
}

function Tool({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed, hovered }: PressState) => [
        styles.tool,
        bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
        pressed ? null : hoverFill(t, 'panel', hovered),
      ]}
    >
      <PixelIcon name={icon} size={12} colour={t.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: space.cell,
    bottom: space.cell,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    paddingHorizontal: space.cell,
    paddingVertical: space.xs,
    // Wraps rather than overflowing: this sits over a canvas on a phone too.
    flexWrap: 'wrap',
    maxWidth: '92%',
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.cell, minHeight: touch },
  switch: { flexDirection: 'row' },
  switchCell: {
    minWidth: 34,
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rule: { width: 2, alignSelf: 'stretch', marginHorizontal: space.xs },
  tool: {
    width: touch - space.md,
    height: touch - space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
