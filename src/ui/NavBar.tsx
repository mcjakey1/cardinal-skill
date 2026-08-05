/**
 * The four-cell navigation bar, fixed to the bottom edge.
 *
 * Cells never move and never reorder — the whole grammar of this interface is
 * that regions stay put, and a student who learns that RECORD is third should
 * never have to look again.
 *
 * CHART goes to the chart you last opened. Before you have opened one it goes to
 * the course list, because a chart cell that leads nowhere is a lie.
 */

import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePrefs } from '@/lib/prefs';
import { palette, space, touch } from '@/theme/tokens';
import { PixelIcon, PixelText, bevelStyle, type IconName } from './pixel';

interface Cell {
  key: string;
  label: string;
  icon: IconName;
  /** Route prefix that marks this cell as the one you are on. */
  match: string;
}

const CELLS: Cell[] = [
  { key: 'chart', label: 'Chart', icon: 'chart', match: '/tree' },
  { key: 'courses', label: 'Courses', icon: 'stack', match: '/courses' },
  { key: 'record', label: 'Record', icon: 'stamp', match: '/record' },
  { key: 'system', label: 'System', icon: 'gear', match: '/system' },
];

export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { lastCourseId } = usePrefs();

  const go = (cell: Cell) => {
    if (cell.key === 'chart') {
      if (lastCourseId) {
        router.navigate({ pathname: '/tree/[courseId]', params: { courseId: lastCourseId } });
      } else {
        router.navigate('/courses');
      }
      return;
    }
    router.navigate(cell.match as '/courses' | '/record' | '/system');
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {CELLS.map((cell) => {
        const active = pathname.startsWith(cell.match);
        return (
          <Pressable
            key={cell.key}
            onPress={() => go(cell)}
            accessibilityRole="tab"
            accessibilityLabel={cell.label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.cell,
              bevelStyle(active ? 'cardinal' : 'panel', pressed ? 'inset' : 'raised'),
            ]}
          >
            <PixelIcon
              name={cell.icon}
              size={16}
              colour={active ? palette.bone : palette.haze}
            />
            <PixelText variant="micro" colour={active ? palette.bone : palette.haze}>
              {cell.label.toUpperCase()}
            </PixelText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: palette.void },
  cell: {
    flex: 1,
    minHeight: touch,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.hair,
    paddingVertical: space.cell,
  },
});
