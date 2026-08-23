/**
 * The navigation bar, fixed to the bottom edge.
 *
 * Cells never move and never reorder — the whole grammar of this interface is
 * that regions stay put, and a student who learns that RECORD is fourth should
 * never have to look again.
 *
 * CHART goes to the chart you last opened. Before you have opened one it goes to
 * the course list, because a chart cell that leads nowhere is a lie.
 */

import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePrefs } from '@/lib/prefs';
import { useAppTheme } from '@/theme/ThemeProvider';
import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import {
  PixelIcon,
  PixelText,
  bevelStyle,
  type IconName,
  type PressState,
} from './pixel';
import { usePixelTransition, usePixelTransitionState } from './PixelTransition';
import { useAuth } from '@/auth/AuthContext';

interface Cell {
  key: string;
  label: string;
  icon: IconName;
  /** Route prefix that marks this cell as the one you are on. */
  match: string;
}

const CELLS: Cell[] = [
  { key: 'chart', label: 'Chart', icon: 'chart', match: '/tree' },
  { key: 'missions', label: 'Missions', icon: 'play', match: '/missions' },
  { key: 'courses', label: 'Courses', icon: 'stack', match: '/courses' },
  { key: 'record', label: 'Record', icon: 'stamp', match: '/record' },
  { key: 'system', label: 'System', icon: 'gear', match: '/system' },
];

/**
 * What an instructor gets instead.
 *
 * MISSIONS and RECORD are a student's own run through a course and mean nothing
 * to the person who wrote it, so they give up their cells to WORKSPACE — the way
 * back to the instructor screens from a chart, which is otherwise a dead end.
 * The cells that survive keep their positions, because the rule this bar is
 * built on is that a cell never moves.
 */
const INSTRUCTOR_CELLS: Cell[] = [
  { key: 'chart', label: 'Chart', icon: 'chart', match: '/tree' },
  { key: 'courses', label: 'Courses', icon: 'stack', match: '/courses' },
  { key: 'workspace', label: 'Workspace', icon: 'stamp', match: '/instructor' },
  { key: 'system', label: 'System', icon: 'gear', match: '/system' },
];

export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { lastCourseId, role } = usePrefs();
  const { session } = useAuth();
  const { theme } = useAppTheme();
  const { transition } = usePixelTransition();
  const isTransitioning = usePixelTransitionState();
  const cells = (session?.role ?? role) === 'instructor' ? INSTRUCTOR_CELLS : CELLS;

  const go = (cell: Cell) => {
    if (pathname.startsWith(cell.match)) return;
    transition(() => {
    if (cell.key === 'chart') {
      if (lastCourseId) {
        router.navigate({ pathname: '/tree/[courseId]', params: { courseId: lastCourseId } });
      } else {
        router.navigate('/courses');
      }
      return;
    }
    router.navigate(
      cell.match as '/missions' | '/courses' | '/record' | '/system' | '/instructor',
    );
    });
  };

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: insets.bottom,
          backgroundColor: theme.hudBackground,
          borderTopColor: theme.border,
        },
      ]}
    >
      {cells.map((cell) => {
        const active = pathname.startsWith(cell.match);
        return (
          <NavCell
            key={cell.key}
            cell={cell}
            active={active}
            disabled={isTransitioning}
            onPress={() => go(cell)}
          />
        );
      })}
    </View>
  );
}

function NavCell({ cell, active, disabled, onPress }: {
  cell: Cell;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const { theme } = useAppTheme();
  const [hovered, setHovered] = useState(false);
  const ink = active
    ? theme.background
    : hovered
      ? theme.nodeCompleted.border
      : theme.textMuted;
  const fill = active
    ? hovered ? theme.nodeActive.border : theme.navActiveTab
    : hovered ? theme.surfaceHover : theme.surface;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      accessibilityRole="tab"
      accessibilityLabel={cell.label}
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }: PressState) => [
        styles.cell,
        bevelStyle(t, active ? 'brand' : 'panel', pressed ? 'inset' : 'raised'),
        { backgroundColor: fill },
        disabled ? { opacity: 0.72 } : null,
      ]}
    >
      <PixelIcon name={cell.icon} size={16} colour={ink} />
      <PixelText variant="micro" colour={ink}>{cell.label.toUpperCase()}</PixelText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 2 },
  cell: {
    flex: 1,
    minHeight: touch,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.hair,
    paddingVertical: space.cell,
  },
});
