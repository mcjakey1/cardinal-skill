import type { ComponentType } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import { View } from 'react-native';

interface Props {
  reduceMotion: boolean;
  style: StyleProp<ViewStyle>;
  mode?: 'continuous' | 'locate';
}

type WebPulseProps = ViewProps & { className?: string };
const WebPulseView = View as ComponentType<WebPulseProps>;

/** Web delegates the pulse to CSS so navigation never accumulates JS loops. */
export function NodePulse({ reduceMotion, style, mode = 'continuous' }: Props) {
  return (
    <WebPulseView
      className={reduceMotion ? undefined : mode === 'locate' ? 'cardinal-locate-pulse' : 'cardinal-node-pulse'}
      pointerEvents="none"
      style={style}
    />
  );
}
