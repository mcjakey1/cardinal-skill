import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { courseKindLabel, type CourseKind } from '@/features/skilltree/courseDistribution';
import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelButton, PixelIcon, PixelText, bevelStyle } from './pixel';

interface Props {
  visible: boolean;
  courseTitle: string;
  courseKind: CourseKind;
  busy: boolean;
  error: string | null;
  reduceMotion: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function PracticeCopyPrompt({
  visible,
  courseTitle,
  courseKind,
  busy,
  error,
  reduceMotion,
  onCancel,
  onConfirm,
}: Props) {
  const t = useTheme();
  const { theme } = useAppTheme();
  const owner = courseKind === 'official'
    ? 'the instructor'
    : courseKind === 'community' ? 'the student author' : 'its owner';

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? 'none' : 'fade'}
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <SafeAreaView
        style={[styles.backdrop, { backgroundColor: theme.background }]}
        accessibilityViewIsModal
      >
        <View style={[styles.dialog, { backgroundColor: theme.hudBackground, borderColor: theme.border }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <PixelText variant="title" colour={t.ink}>Create a practice copy?</PixelText>
              <PixelText variant="micro" colour={courseKind === 'official' ? t.warning : t.info}>
                {courseKindLabel(courseKind).toUpperCase()} COURSE · READ ONLY
              </PixelText>
            </View>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Close practice copy prompt"
              style={({ pressed }) => [styles.close, bevelStyle(t, 'panel', pressed ? 'inset' : 'raised')]}
            >
              <PixelIcon name="close" size={14} colour={t.ink} />
            </Pressable>
          </View>

          <View style={styles.copy}>
            <PixelText variant="body" colour={t.ink}>
              Only {owner} can edit {courseTitle}. Create a private copy to change its chart, missions, prerequisites, or XP.
            </PixelText>
            <PixelText variant="micro" colour={t.info}>
              PRIVATE PRACTICE · ZERO PROGRESS · ORIGINAL UNCHANGED
            </PixelText>
          </View>

          {error ? <PixelText variant="body" colour={t.alarm}>{error}</PixelText> : null}

          <View style={styles.footer}>
            <PixelButton label="Cancel" tone="panel" grow={false} disabled={busy} onPress={onCancel} />
            <PixelButton
              label={busy ? 'Creating copy…' : 'Create practice copy'}
              grow={false}
              disabled={busy}
              onPress={onConfirm}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
  dialog: { width: '100%', maxWidth: 540, borderWidth: bevel, padding: space.md, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  headerCopy: { minWidth: 0, flex: 1, gap: space.xs },
  close: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: space.cell },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: space.cell },
});
