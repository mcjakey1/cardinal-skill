import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

export interface WheelPoint {
  x: number;
  y: number;
}

export interface CanvasGestureSurfaceProps {
  gesture: ComponentProps<typeof GestureDetector>['gesture'];
  children: ReactNode;
  onWheelZoom?: (factor: number, point: WheelPoint) => void;
  connecting?: boolean;
  onCancelConnect?: () => void;
}

/** Native surface; wheel input is added by the web-specific sibling file. */
export function CanvasGestureSurface({ gesture, children }: CanvasGestureSurfaceProps) {
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  );
}
