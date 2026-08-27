import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CourseOption } from './courseQueries';
import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelIcon, PixelText, bevelStyle } from '@/ui/pixel';

export type RecordView = 'leaderboard' | 'dossier';

interface Props {
  scopeId: string;
  courses: readonly CourseOption[];
  view: RecordView;
  onScopeChange: (scopeId: string) => void;
  onViewChange: (view: RecordView) => void;
}

export function RecordHeader({ scopeId, courses, view, onScopeChange, onViewChange }: Props) {
  const options = [
    { value: 'all', label: 'Global · all enrolled courses' },
    ...courses.map((course) => ({
      value: course.id,
      label: [course.courseCode, course.title].filter(Boolean).join(' · '),
    })),
  ];
  const selected = options.find((option) => option.value === scopeId)?.label ?? options[0]!.label;

  return (
    <View style={styles.header}>
      <ScopePicker value={selected} selectedValue={scopeId} options={options} onChange={onScopeChange} />
      <View style={styles.views} accessibilityRole="radiogroup" accessibilityLabel="Record view">
        <ViewButton
          label="Dossier & stamps"
          icon="stamp"
          active={view === 'dossier'}
          onPress={() => onViewChange('dossier')}
        />
        <ViewButton
          label="Leaderboard"
          icon="crown"
          active={view === 'leaderboard'}
          onPress={() => onViewChange('leaderboard')}
        />
      </View>
    </View>
  );
}

function ViewButton({ label, icon, active, onPress }: {
  label: string;
  icon: 'crown' | 'stamp';
  active: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.viewButton,
        bevelStyle(t, active ? 'brand' : 'panel', pressed || active ? 'inset' : 'raised'),
      ]}
    >
      <PixelIcon name={icon} size={12} colour={active ? t.brandInk : t.info} />
      <PixelText variant="micro" colour={active ? t.brandInk : t.inkMuted} numberOfLines={1}>
        {label.toUpperCase()}
      </PixelText>
    </Pressable>
  );
}

function ScopePicker({ value, selectedValue, options, onChange }: {
  value: string;
  selectedValue: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.scopeWrap}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Scope: ${value}. Open choices.`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.scope, bevelStyle(t, 'panel', pressed ? 'inset' : 'raised')]}
      >
        <PixelIcon name="stack" size={14} colour={t.info} />
        <View style={styles.scopeCopy}>
          <PixelText variant="micro" colour={t.inkMuted}>SCOPE</PixelText>
          <PixelText variant="body" colour={t.ink} numberOfLines={1}>{value}</PixelText>
        </View>
        <PixelIcon name="more" size={12} colour={t.info} />
      </Pressable>

      <Modal transparent visible={open} animationType="none" onRequestClose={() => setOpen(false)}>
        <View style={[styles.overlay, { backgroundColor: t.ground }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close scope choices"
          />
          <View style={[styles.menu, bevelStyle(t, 'panel', 'raised')]} accessibilityRole="radiogroup" accessibilityLabel="Record scope">
            <PixelText variant="label">Record scope</PixelText>
            <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuContent}>
              {options.map((option) => {
                const active = option.value === selectedValue;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => { onChange(option.value); setOpen(false); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={option.label}
                    style={({ pressed }) => [
                      styles.option,
                      bevelStyle(t, active ? 'brand' : 'panel', pressed || active ? 'inset' : 'raised'),
                    ]}
                  >
                    <PixelText variant="body" colour={active ? t.brandInk : t.ink}>{option.label}</PixelText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.cell },
  scopeWrap: { minWidth: 0 },
  scope: { minHeight: touch + space.cell, flexDirection: 'row', alignItems: 'center', gap: space.cell, paddingHorizontal: space.cell },
  scopeCopy: { minWidth: 0, flex: 1 },
  views: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  viewButton: { minHeight: touch, minWidth: 0, flexGrow: 1, flexBasis: 200, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.cell, paddingHorizontal: space.cell },
  overlay: { flex: 1, justifyContent: 'center', padding: space.md },
  menu: { width: '100%', maxWidth: 560, maxHeight: '70%', alignSelf: 'center', padding: space.md, gap: space.cell },
  menuScroll: { flexGrow: 0 },
  menuContent: { gap: space.xs },
  option: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space.md },
});
