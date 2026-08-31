import { Pressable, StyleSheet, View } from 'react-native';

import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelIcon, PixelText, bevelStyle } from '@/ui/pixel';

export type CoachAction = 'explain' | 'hint' | 'quiz' | 'custom';

export function NodeAiCoach({ onAction }: { onAction: (action: CoachAction) => void }) {
  const t = useTheme();
  const actions: { action: CoachAction; icon: 'chart' | 'stamp' | 'stack' | 'edit'; label: string }[] = [
    { action: 'explain', icon: 'chart', label: 'Explain step-by-step' },
    { action: 'hint', icon: 'stamp', label: 'Give mission hint' },
    { action: 'quiz', icon: 'stack', label: 'Practice quiz (3 questions)' },
    { action: 'custom', icon: 'edit', label: 'Custom question' },
  ];
  return (
    <View style={[styles.coach, { backgroundColor: t.panel, borderColor: t.info }]}>
      <View style={styles.coachHeading}>
        <PixelIcon name="chart" size={14} colour={t.info} />
        <View style={styles.copy}>
          <PixelText variant="micro" colour={t.info} style={styles.title}>AI STUDY COMPANION</PixelText>
          <PixelText variant="micro" colour={t.inkMuted}>
            Get concept help, a mission hint, or a quick self-check.
          </PixelText>
        </View>
      </View>
      <View style={styles.actions}>
        {actions.map(({ action, icon, label }) => (
          <Pressable
            key={action}
            onPress={() => onAction(action)}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [
              styles.action,
              bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
            ]}
          >
            <PixelIcon name={icon} size={12} colour={t.info} />
            <PixelText variant="micro" colour={t.ink}>{label.toUpperCase()}</PixelText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coach: { borderWidth: bevel, padding: space.cell, gap: space.cell, marginTop: space.md },
  coachHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: space.cell },
  copy: { flex: 1, minWidth: 0, gap: space.hair },
  title: { fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  action: {
    minHeight: touch,
    minWidth: 156,
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.cell,
  },
});
