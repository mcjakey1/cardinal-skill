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

import { Pressable, StyleSheet } from 'react-native';

import { space, touch } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
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
  editMode?: boolean;
  onToggleEditMode?: (next: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  scale: number;
}

export function ChartTools({
  editMode,
  onToggleEditMode,
  onZoomIn,
  onZoomOut,
  onFit,
  scale,
}: Props) {
  const t = useTheme();
  const { theme } = useAppTheme();

  return (
    <Bevel tone="panel" style={[styles.bar, { backgroundColor: theme.hudBackground }]}>
      <Tool icon="minus" label="Zoom out" onPress={onZoomOut} />
      <PixelText variant="micro" colour={t.inkMuted}>
        {Math.round(scale * 100)}%
      </PixelText>
      <Tool icon="plus" label="Zoom in" onPress={onZoomIn} />
      <Tool icon="fit" label="Recenter and fit the chart" onPress={onFit} />
      {onToggleEditMode ? (
        <Tool
          icon="edit"
          label={editMode ? 'Exit tree edit mode' : 'Enter tree edit mode'}
          onPress={() => onToggleEditMode(!editMode)}
          active={Boolean(editMode)}
        />
      ) : null}
    </Bevel>
  );
}

function Tool({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed, hovered }: PressState) => [
        styles.tool,
        bevelStyle(t, active ? 'brand' : 'panel', pressed || active ? 'inset' : 'raised'),
        pressed || active ? null : hoverFill(t, 'panel', hovered),
      ]}
    >
      <PixelIcon name={icon} size={12} colour={active ? t.brandInk : t.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    padding: space.xs,
    flexShrink: 0,
    overflow: 'visible',
  },
  tool: {
    width: touch - space.md,
    height: touch - space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
