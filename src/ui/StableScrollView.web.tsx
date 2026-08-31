import { useMemo } from 'react';
import { ScrollView, type ScrollViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/useTheme';

type StableWebStyle = ViewStyle & {
  overflowY: 'scroll';
  scrollbarGutter: 'stable';
  scrollbarWidth: 'thin';
  scrollbarColor: string;
};

/** Permanently reserves the track so expanding tasks cannot move drawer text. */
export function StableScrollView({ style, ...props }: ScrollViewProps) {
  const t = useTheme();
  const stableWebStyle = useMemo<StableWebStyle>(() => ({
    overflowY: 'scroll',
    scrollbarGutter: 'stable',
    scrollbarWidth: 'thin',
    scrollbarColor: `${t.locate} ${t.ground}`,
  }), [t.ground, t.locate]);
  return <ScrollView style={[style, stableWebStyle]} {...props} />;
}
