import type { ComponentType } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import { View } from 'react-native';

interface Props {
  reduceMotion: boolean;
  style: StyleProp<ViewStyle>;
}

type WebPulseProps = ViewProps & { className?: string };
const WebPulseView = View as ComponentType<WebPulseProps>;

/** Web delegates the pulse to CSS so navigation never accumulates JS loops. */
export function NodePulse({ reduceMotion, style }: Props) {
  return (
    <WebPulseView
      className={reduceMotion ? undefined : 'cardinal-node-pulse'}
      pointerEvents="none"
      style={style}
    />
  );
}
