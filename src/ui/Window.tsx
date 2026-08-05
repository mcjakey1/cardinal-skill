/**
 * The window: a titled panel with a close box.
 *
 * On the desktop screens this grammar comes from, a window floats and drags. A
 * phone has neither a pointer nor anywhere to drag to, so here it docks to the
 * bottom of the screen and keeps only the affordance that still means something:
 * the close box. Minimise and maximise are not reproduced as decoration.
 *
 * It is an `accessibilityLiveRegion`, because on the chart it is how the app
 * answers a tap.
 */

import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Bevel, PixelIcon, PixelText, bevelStyle } from './pixel';

interface Props extends ViewProps {
  title: string;
  onClose?: () => void;
  /** Announce the contents when they change. On by default. */
  live?: boolean;
  children: React.ReactNode;
}

export function Window({ title, onClose, live = true, style, children, ...rest }: Props) {
  const t = useTheme();
  return (
    <Bevel
      tone="panel"
      depth="raised"
      style={[{ backgroundColor: t.panel }, style]}
      accessibilityLiveRegion={live ? 'polite' : 'none'}
      {...rest}
    >
      <View style={[styles.titleBar, { backgroundColor: t.brand }]}>
        <PixelText
          variant="label"
          colour={t.tone.brand.ink}
          numberOfLines={1}
          style={styles.title}
        >
          {title.toUpperCase()}
        </PixelText>
        {onClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close details"
            hitSlop={space.cell}
            style={({ pressed }) => [
              styles.close,
              bevelStyle(t, 'brand', pressed ? 'inset' : 'raised'),
            ]}
          >
            <PixelIcon name="close" size={12} colour={t.tone.brand.ink} />
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.body, { backgroundColor: t.well }]}>{children}</View>
    </Bevel>
  );
}

const styles = StyleSheet.create({
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.cell,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    gap: space.cell,
  },
  title: { flexShrink: 1 },
  close: {
    width: touch - space.md,
    height: touch - space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: space.md,
    gap: space.cell,
    margin: space.xs,
  },
});
