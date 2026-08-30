import { ScrollView, type ScrollViewProps, type ViewStyle } from 'react-native';

type StableWebStyle = ViewStyle & {
  overflowY: 'scroll';
  scrollbarGutter: 'stable';
};

const stableWebStyle: StableWebStyle = {
  overflowY: 'scroll',
  scrollbarGutter: 'stable',
};

/** Permanently reserves the track so expanding tasks cannot move drawer text. */
export function StableScrollView({ style, ...props }: ScrollViewProps) {
  return <ScrollView style={[style, stableWebStyle]} {...props} />;
}
