import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePrefs } from '@/lib/prefs';
import { useAppTheme } from '@/theme/ThemeProvider';
import {
  PIXEL_WIPE_COLUMNS as COLUMNS,
  PIXEL_WIPE_ROWS as ROWS,
  pixelThreshold,
  pixelVisible,
} from './pixelTransitionMath';

type TransitionAction = () => void;
interface PixelTransitionValue {
  transition: (action: TransitionAction) => void;
}

interface CanvasHost extends View {
  appendChild: (child: HTMLCanvasElement) => void;
  removeChild: (child: HTMLCanvasElement) => void;
}

const PixelTransitionActionContext = createContext<PixelTransitionValue>({
  transition: (action) => action(),
});
const PixelTransitionStateContext = createContext(false);
const PHASE_MS = 250;
const TOTAL_MS = PHASE_MS * 2;
const NAV_HEIGHT = 56;

export function PixelTransitionProvider({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const { motionOff } = usePrefs();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const hostRef = useRef<CanvasHost | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const thresholdsRef = useRef(new Float32Array(COLUMNS * ROWS));
  const frameRef = useRef<number | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const canvasHeight = Math.max(1, height - NAV_HEIGHT - insets.bottom);
  const dimensions = useRef({ width, height: canvasHeight });
  const motionDisabled = useRef(motionOff);
  dimensions.current = { width, height: canvasHeight };
  motionDisabled.current = motionOff;
  const palette = useRef([theme.navActiveTab, theme.nodeCompleted.border] as const);
  palette.current = [theme.navActiveTab, theme.nodeCompleted.border] as const;

  useEffect(() => {
    mounted.current = true;
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      imageRendering: 'pixelated',
      transform: 'translateZ(0)',
    });
    host.appendChild(canvas);
    canvasRef.current = canvas;
    contextRef.current = canvas.getContext('2d', { alpha: true, desynchronized: true });
    return () => {
      mounted.current = false;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      running.current = false;
      canvas.remove();
      canvasRef.current = null;
      contextRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;
    const density = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(width * density);
    canvas.height = Math.ceil(canvasHeight * density);
    context.setTransform(density, 0, 0, density, 0, 0);
    context.imageSmoothingEnabled = false;
    for (let column = 0; column < COLUMNS; column += 1) {
      for (let row = 0; row < ROWS; row += 1) {
        thresholdsRef.current[column * ROWS + row] = pixelThreshold(column, row);
      }
    }
  }, [canvasHeight, width]);

  const transition = useCallback((action: TransitionAction) => {
    if (motionDisabled.current || running.current) {
      if (!running.current) action();
      return;
    }
    const context = contextRef.current;
    if (!context) {
      action();
      return;
    }
    running.current = true;
    setIsTransitioning(true);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    let switched = false;
    const startedAt = performance.now();

    const draw = (now: number) => {
      if (!mounted.current) return;
      const { width: frameWidth, height: frameHeight } = dimensions.current;
      const elapsed = Math.min(TOTAL_MS, now - startedAt);
      const progress = elapsed / TOTAL_MS;
      context.clearRect(0, 0, frameWidth, frameHeight);
      const pixelWidth = Math.ceil(frameWidth / COLUMNS);
      const pixelHeight = Math.ceil(frameHeight / ROWS);

      for (let column = 0; column < COLUMNS; column += 1) {
        for (let row = 0; row < ROWS; row += 1) {
          const threshold = thresholdsRef.current[column * ROWS + row] ?? 1;
          const visible = pixelVisible(progress, threshold);
          if (!visible) continue;
          context.fillStyle = palette.current[(column + row) % 2] ?? palette.current[0];
          context.fillRect(column * pixelWidth, row * pixelHeight, pixelWidth, pixelHeight);
        }
      }

      if (!switched && elapsed >= PHASE_MS) {
        switched = true;
        try {
          action();
        } catch (error) {
          context.clearRect(0, 0, frameWidth, frameHeight);
          frameRef.current = null;
          running.current = false;
          setIsTransitioning(false);
          throw error;
        }
      }
      if (elapsed < TOTAL_MS) {
        frameRef.current = requestAnimationFrame(draw);
      } else {
        context.clearRect(0, 0, frameWidth, frameHeight);
        frameRef.current = null;
        running.current = false;
        setIsTransitioning(false);
      }
    };
    frameRef.current = requestAnimationFrame(draw);
  }, []);

  const value = useMemo(() => ({ transition }), [transition]);
  return (
    <PixelTransitionActionContext.Provider value={value}>
      <PixelTransitionStateContext.Provider value={isTransitioning}>
        {children}
        <View
          ref={hostRef}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.overlay, { bottom: NAV_HEIGHT + insets.bottom }]}
        />
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
  overlay: { position: 'absolute', top: 0, right: 0, left: 0, zIndex: 100, overflow: 'hidden' },
});
