import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePrefs } from '@/lib/prefs';
import { useAppTheme } from '@/theme/ThemeProvider';

type TransitionAction = () => void;
interface PixelTransitionValue {
  transition: (action: TransitionAction) => void;
}

const PixelTransitionActionContext = createContext<PixelTransitionValue>({
  transition: (action) => action(),
});
const PixelTransitionStateContext = createContext(false);
const PHASE_MS = 250;
const NAV_HEIGHT = 56;

/** Native uses one composited slab; web replaces this file with a canvas renderer. */
export function PixelTransitionProvider({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const { motionOff } = usePrefs();
  const [active, setActive] = useState(false);
  const running = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const progress = useSharedValue(0);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    running.current = false;
    cancelAnimation(progress);
  }, [progress]);

  const transition = useCallback((action: TransitionAction) => {
    if (motionOff || running.current) {
      if (!running.current) action();
      return;
    }
    running.current = true;
    setActive(true);
    progress.value = 0;
    progress.value = withSequence(
      withTiming(1, { duration: PHASE_MS, easing: Easing.linear }),
      withTiming(2, { duration: PHASE_MS, easing: Easing.linear }),
    );
    timers.current.push(setTimeout(() => {
      try {
        action();
      } catch (error) {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        running.current = false;
        setActive(false);
        throw error;
      }
    }, PHASE_MS));
    timers.current.push(setTimeout(() => {
      running.current = false;
      setActive(false);
      timers.current = [];
    }, PHASE_MS * 2));
  }, [motionOff, progress]);

  const wipeStyle = useAnimatedStyle(() => {
    const covering = progress.value <= 1;
    return {
      left: covering ? 0 : width * (progress.value - 1),
      width: covering ? width * progress.value : width * (2 - progress.value),
    };
  }, [width]);
  const value = useMemo(() => ({ transition }), [transition]);

  return (
    <PixelTransitionActionContext.Provider value={value}>
      <PixelTransitionStateContext.Provider value={active}>
        {children}
        {active ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.overlay,
              { bottom: NAV_HEIGHT + insets.bottom, backgroundColor: theme.navActiveTab },
              wipeStyle,
            ]}
          />
        ) : null}
      </PixelTransitionStateContext.Provider>
    </PixelTransitionActionContext.Provider>
  );
}

export function usePixelTransition(): PixelTransitionValue {
  return useContext(PixelTransitionActionContext);
}

export function usePixelTransitionState(): boolean {
  return useContext(PixelTransitionStateContext);
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, zIndex: 100 },
});
