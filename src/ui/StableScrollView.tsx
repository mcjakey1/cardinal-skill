import { ScrollView, type ScrollViewProps } from 'react-native';

/** Native scroll view; web reserves its scrollbar gutter in the sibling file. */
export function StableScrollView(props: ScrollViewProps) {
  return <ScrollView {...props} />;
}
