import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  reduceMotion: boolean;
  style: StyleProp<ViewStyle>;
  mode?: 'continuous' | 'locate';
}

/** Native keeps one UI-thread animation per visible active node. */
export function NodePulse({ reduceMotion, style, mode = 'continuous' }: Props) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(opacity);
    if (reduceMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = mode === 'locate'
      ? withRepeat(withSequence(
          withTiming(0.2, { duration: 250 }),
          withTiming(1, { duration: 250 }),
        ), 3, false)
      : withRepeat(withTiming(0.35, { duration: 1800 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [mode, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View pointerEvents="none" style={[style, animatedStyle]} />;
}
