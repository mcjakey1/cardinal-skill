import { useEffect } from 'react';
import type { NativeSyntheticEvent, ViewProps, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import type { CanvasGestureSurfaceProps } from './CanvasGestureSurface';

interface WheelNativeEvent {
  deltaY: number;
  offsetX?: number;
  offsetY?: number;
  locationX?: number;
  locationY?: number;
}

type WheelViewProps = ViewProps & {
  onWheel?: (event: NativeSyntheticEvent<WheelNativeEvent>) => void;
};

const WheelView = View as React.ComponentType<WheelViewProps>;

export function CanvasGestureSurface({ gesture, children, onWheelZoom, connecting, onCancelConnect }: CanvasGestureSurfaceProps) {
  useEffect(() => {
    if (!connecting || !onCancelConnect) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancelConnect();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [connecting, onCancelConnect]);

  return (
    <GestureDetector gesture={gesture}>
      <WheelView
        style={[{ flex: 1 }, connecting ? webCrosshair : null]}
        onWheel={(event) => {
          event.preventDefault();
          const native = event.nativeEvent;
          onWheelZoom?.(native.deltaY < 0 ? 1.1 : 0.9, {
            x: native.offsetX ?? native.locationX ?? 0,
            y: native.offsetY ?? native.locationY ?? 0,
          });
        }}
      >
        {children}
      </WheelView>
    </GestureDetector>
  );
}

const webCrosshair = { cursor: 'crosshair' } as unknown as ViewStyle;
