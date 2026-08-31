import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { OutlineEntry } from './courseOutline';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelIcon, PixelText } from '@/ui/pixel';

interface Props {
  entry: OutlineEntry;
  active: boolean;
  reduceMotion: boolean;
  onPress: () => void;
}

export function CourseOutlineItem({ entry, active, reduceMotion, onPress }: Props) {
  const t = useTheme();
  const selected = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    selected.value = withTiming(active ? 1 : 0, { duration: reduceMotion ? 0 : 150 });
  }, [active, reduceMotion, selected]);
  const rowMotion = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(selected.value, [0, 1], [t.panel, t.brand]),
    borderColor: interpolateColor(selected.value, [0, 1], [t.line, t.brand]),
  }));
  const icon = entry.status === 'mastered' ? 'check' : entry.status === 'locked' ? 'lock' : 'play';
  const inactiveIcon = entry.status === 'mastered'
    ? t.earnedText
    : entry.status === 'locked' ? t.inkMuted : t.warning;

  return (
    <Animated.View style={[styles.frame, rowMotion]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${entry.position}. ${entry.node.title}. ${entry.status.replace('_', ' ')}. Open node details.`}
        style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      >
        <View style={[styles.marker, { backgroundColor: active ? t.tone.brand.dark : 'transparent' }]}>
          <PixelIcon name={icon} size={12} colour={active ? t.brandInk : inactiveIcon} />
        </View>
        <View style={styles.copy}>
          <PixelText variant="body" colour={active ? t.brandInk : t.ink} numberOfLines={2}>
            {entry.node.title}
          </PixelText>
          <PixelText variant="micro" colour={active ? t.brandInk : t.inkMuted}>
            {entry.status === 'mastered' ? 'MASTERED' : entry.status === 'locked' ? 'LOCKED' : 'READY'}
            {' · '}{entry.node.xpReward} XP
          </PixelText>
        </View>
        <PixelIcon name="play" size={12} colour={active ? t.brandInk : t.info} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { minHeight: touch, borderWidth: bevel },
  row: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.cell,
    gap: space.cell,
  },
  pressed: { opacity: 0.82 },
  marker: {
    width: space.lg,
    height: space.lg,
    borderRadius: bevel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: space.hair },
});
