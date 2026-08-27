import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { CourseOption } from './courseQueries';
import type { MissionFilter, MissionSort } from './missionBoard';
import { COMPACT_AT } from '@/lib/layout';
import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelIcon, PixelText, bevelStyle } from '@/ui/pixel';

const SORTS: readonly { value: MissionSort; label: string; compactLabel: string }[] = [
  { value: 'curriculum', label: 'Curriculum order', compactLabel: 'Curriculum' },
  { value: 'xp', label: 'Most XP', compactLabel: 'Most XP' },
  { value: 'duration', label: 'Shortest', compactLabel: 'Shortest' },
  { value: 'difficulty', label: 'Hardest first', compactLabel: 'Hardest' },
];

const FILTERS: readonly { value: MissionFilter; label: string }[] = [
  { value: 'open', label: 'Active / ready' },
  { value: 'all', label: 'All' },
  { value: 'done', label: 'Completed' },
  { value: 'locked', label: 'Locked' },
];

interface Props {
  courseId: string;
  courses: readonly CourseOption[];
  sort: MissionSort;
  filter: MissionFilter;
  counts: Record<MissionFilter, number>;
  onCourseChange: (courseId: string) => void;
  onSortChange: (sort: MissionSort) => void;
  onFilterChange: (filter: MissionFilter) => void;
}

export function MissionsHeader(props: Props) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const courseOptions = [
    { value: 'all', label: 'All courses' },
    ...props.courses.map((course) => ({
      value: course.id,
      label: [course.courseCode, course.title, course.term].filter(Boolean).join(' · '),
    })),
  ];
  const courseLabel = courseOptions.find((option) => option.value === props.courseId)?.label
    ?? 'Choose a course';
  const selectedSort = SORTS.find((option) => option.value === props.sort) ?? SORTS[0]!;
  const sortLabel = width < COMPACT_AT ? selectedSort.compactLabel : selectedSort.label;

  return (
    <View style={styles.header}>
      <View style={styles.commandRow}>
        <PickerButton
          label="Course"
          value={courseLabel}
          selectedValue={props.courseId}
          icon="chart"
          options={courseOptions}
          onChange={props.onCourseChange}
          style={styles.coursePicker}
        />
        <PickerButton
          label="Sort"
          value={sortLabel}
          selectedValue={props.sort}
          icon="stack"
          options={SORTS}
          onChange={(value) => props.onSortChange(value as MissionSort)}
          style={styles.sortPicker}
        />
      </View>

      <View style={styles.tabs}>
        {FILTERS.map((item) => {
          const active = props.filter === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => props.onFilterChange(item.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.label}, ${props.counts[item.value]} missions`}
              style={({ pressed }) => [
                styles.tab,
                bevelStyle(t, active ? 'brand' : 'panel', pressed || active ? 'inset' : 'raised'),
              ]}
            >
              <PixelText variant="micro" colour={active ? t.brandInk : t.inkMuted} centred>
                {item.label.toUpperCase()} ({props.counts[item.value]})
              </PixelText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PickerButton({
  label,
  value,
  selectedValue,
  icon,
  options,
  onChange,
  style,
}: {
  label: string;
  value: string;
  selectedValue: string;
  icon: 'chart' | 'stack';
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  style?: object;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={style}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}. Open choices.`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.picker, bevelStyle(t, 'panel', pressed ? 'inset' : 'raised')]}
      >
        <PixelIcon name={icon} size={14} colour={t.info} />
        <View style={styles.pickerText}>
          <PixelText variant="micro" colour={t.inkMuted}>{label.toUpperCase()}</PixelText>
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
            accessibilityLabel={`Close ${label.toLowerCase()} choices`}
          />
          <View
            style={[styles.menu, bevelStyle(t, 'panel', 'raised')]}
            accessibilityRole="radiogroup"
            accessibilityLabel={`${label} choices`}
          >
            <PixelText variant="label" colour={t.ink}>{label}</PixelText>
            <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuContent}>
              {options.map((option) => {
                const selected = option.value === selectedValue;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => { onChange(option.value); setOpen(false); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={option.label}
                    style={({ pressed }) => [
                      styles.option,
                      bevelStyle(t, selected ? 'brand' : 'panel', pressed || selected ? 'inset' : 'raised'),
                    ]}
                  >
                    <PixelText variant="body" colour={selected ? t.brandInk : t.ink}>{option.label}</PixelText>
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
  commandRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.cell },
  coursePicker: { minWidth: 0, flex: 1 },
  sortPicker: { minWidth: 0, flex: 1 },
  picker: {
    minHeight: touch + space.cell,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    paddingHorizontal: space.cell,
  },
  pickerText: { minWidth: 0, flex: 1 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tab: {
    minHeight: touch,
    flexGrow: 1,
    flexBasis: 150,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.cell,
  },
  overlay: { flex: 1, justifyContent: 'center', padding: space.md },
  menu: { width: '100%', maxWidth: 560, maxHeight: '70%', alignSelf: 'center', padding: space.md, gap: space.cell },
  menuScroll: { flexGrow: 0 },
  menuContent: { gap: space.xs },
  option: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space.md },
});
