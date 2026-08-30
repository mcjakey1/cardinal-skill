import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePrefs } from '@/lib/prefs';
import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, space, touch } from '@/theme/tokens';
import type { ThemePalette, ThemePresetId } from '@/theme/themes';
import { BackdropPicker } from './BackdropPicker';
import { PixelButton, PixelIcon, PixelText } from './pixel';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ThemePickerModal({ visible, onClose }: Props) {
  const { theme, currentThemeId, setThemeId, availableThemes } = useAppTheme();
  const { motionOff } = usePrefs();

  return (
    <Modal
      visible={visible}
      animationType={motionOff ? 'none' : 'fade'}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <SafeAreaView
        style={[styles.screen, { backgroundColor: theme.background }]}
        accessibilityViewIsModal
      >
        <View
          style={[
            styles.header,
            { backgroundColor: theme.hudBackground, borderBottomColor: theme.border },
          ]}
        >
          <View style={styles.headerCopy}>
            <PixelText variant="title" colour={theme.textPrimary}>
              Theme and canvas
            </PixelText>
            <PixelText variant="micro" colour={theme.textSecondary}>
              Changes preview instantly. The palette saves on this device; the backdrop saves to your account.
            </PixelText>
          </View>
          <PixelButton label="Done" grow={false} onPress={onClose} />
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {/* The backdrop leads: it is the one setting here a student changes
              more than once, and five full-height palette cards ahead of it is
              a setting nobody finds. */}
          <BackdropPicker />

          <View accessibilityRole="radiogroup" accessibilityLabel="Theme presets">
            {availableThemes.map((preset) => (
              <ThemeOption
                key={preset.id}
                preset={preset}
                selected={preset.id === currentThemeId}
                onSelect={() => setThemeId(preset.id as ThemePresetId)}
              />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ThemeOption({
  preset,
  selected,
  onSelect,
}: {
  preset: ThemePalette;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityLabel={preset.name}
      accessibilityHint="Applies this palette across the student app"
      accessibilityState={{ checked: selected }}
      style={({ pressed, hovered }) => [
        styles.option,
        {
          backgroundColor: hovered ? preset.surfaceHover : preset.surface,
          borderColor: selected ? preset.nodeActive.border : preset.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={styles.optionTop}>
        <View style={styles.optionCopy}>
          <PixelText variant="body" colour={preset.textPrimary} numberOfLines={1}>
            {preset.name}
          </PixelText>
          <PixelText variant="micro" colour={preset.textSecondary}>
            {selected ? 'ACTIVE ON THIS DEVICE' : 'TAP TO PREVIEW'}
          </PixelText>
        </View>
        <View
          style={[
            styles.radioMark,
            {
              backgroundColor: selected ? preset.navActiveTab : preset.background,
              borderColor: selected ? preset.nodeActive.border : preset.border,
            },
          ]}
        />
      </View>

      <View style={styles.preview} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <PreviewNode
          background={preset.nodeCompleted.background}
          border={preset.nodeCompleted.border}
          icon={preset.nodeCompleted.icon}
          name="check"
        />
        <PreviewEdge colour={preset.edgeCompleted} />
        <PreviewNode
          background={preset.nodeActive.background}
          border={preset.nodeActive.border}
          icon={preset.nodeActive.icon}
          name="play"
        />
        <PreviewEdge colour={preset.edgeLocked} />
        <PreviewNode
          background={preset.nodeLocked.background}
          border={preset.nodeLocked.border}
          icon={preset.nodeLocked.icon}
          name="lock"
        />
      </View>

      <View style={[styles.meterTrack, { backgroundColor: preset.xpBarBackground }]}>
        <View style={[styles.meterFill, { backgroundColor: preset.xpBarFill }]} />
      </View>
    </Pressable>
  );
}

function PreviewNode({
  background,
  border,
  icon,
  name,
}: {
  background: string;
  border: string;
  icon: string;
  name: 'check' | 'play' | 'lock';
}) {
  return (
    <View style={[styles.previewNode, { backgroundColor: background, borderColor: border }]}>
      <PixelIcon name={name} size={16} colour={icon} />
    </View>
  );
}

function PreviewEdge({ colour }: { colour: string }) {
  return <View style={[styles.previewEdge, { backgroundColor: colour }]} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: touch + space.md,
    padding: space.md,
    borderBottomWidth: bevel,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  headerCopy: { flex: 1, gap: space.xs },
  list: { padding: space.md, gap: space.md },
  option: {
    minHeight: touch,
    padding: space.md,
    borderWidth: bevel,
    gap: space.md,
    marginBottom: space.md,
  },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  optionCopy: { flex: 1, gap: space.xs },
  radioMark: { width: touch, height: touch, borderWidth: bevel },
  preview: { flexDirection: 'row', alignItems: 'center' },
  previewNode: {
    width: touch,
    height: touch,
    borderWidth: bevel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEdge: { flex: 1, height: bevel },
  meterTrack: { height: space.cell },
  meterFill: { width: '64%', height: '100%' },
});
