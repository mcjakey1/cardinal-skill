import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import type { CatalogCourse } from '@/features/skilltree/courseCatalog';
import { courseKindLabel } from '@/features/skilltree/courseDistribution';
import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelIcon, PixelText, bevelStyle } from './pixel';

interface Props {
  courses: readonly CatalogCourse[];
  busyCourseId: string | null;
  onJoin: (course: CatalogCourse) => void;
  onOpen: (course: CatalogCourse) => void;
  empty?: React.ReactElement | null;
}

export function CourseCatalogList({ courses, busyCourseId, onJoin, onOpen, empty }: Props) {
  return (
    <FlatList
      data={courses}
      keyExtractor={(course) => course.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={empty}
      renderItem={({ item }) => (
        <CatalogRow
          course={item}
          busy={busyCourseId === item.id}
          onPress={() => item.isJoined ? onOpen(item) : onJoin(item)}
        />
      )}
    />
  );
}

function CatalogRow({ course, busy, onPress }: {
  course: CatalogCourse;
  busy: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const { theme } = useAppTheme();
  const accent = course.kind === 'official' ? t.warning : t.locate;
  const facts = [
    course.courseCode,
    course.term,
    course.units === null ? null : `${course.units} UNITS`,
    `${course.learnerCount} LEARNER${course.learnerCount === 1 ? '' : 'S'}`,
  ].filter(Boolean).join(' · ');

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.hudBackground,
          borderTopColor: t.tone.panel.light,
          borderLeftColor: t.tone.panel.light,
          borderRightColor: t.tone.panel.dark,
          borderBottomColor: t.tone.panel.dark,
        },
      ]}
    >
      <View style={styles.copy}>
        <View style={styles.titleLine}>
          <PixelText variant="body" colour={t.ink} numberOfLines={2} style={styles.title}>
            {course.title}
          </PixelText>
          <View style={[styles.badge, { borderColor: accent }]}>
            <PixelText variant="micro" colour={accent}>{courseKindLabel(course.kind).toUpperCase()}</PixelText>
          </View>
        </View>
        <PixelText variant="micro" colour={t.inkMuted} numberOfLines={1}>
          BY {course.ownerDisplayName.toUpperCase()}{facts ? ` · ${facts.toUpperCase()}` : ''}
        </PixelText>
        {course.description ? (
          <PixelText variant="body" colour={t.inkMuted} numberOfLines={2}>
            {course.description}
          </PixelText>
        ) : null}
      </View>

      <Pressable
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={course.isJoined ? `Open ${course.title}` : `Join ${course.title}`}
        accessibilityState={{ disabled: busy }}
        style={({ pressed }) => [
          styles.action,
          bevelStyle(t, course.isJoined ? 'panel' : 'brand', pressed ? 'inset' : 'raised'),
          busy ? styles.disabled : null,
        ]}
      >
        <PixelIcon name={course.isJoined ? 'play' : 'plus'} size={14} colour={course.isJoined ? t.info : t.brandInk} />
        <PixelText variant="micro" colour={course.isJoined ? t.info : t.brandInk}>
          {busy ? 'JOINING…' : course.isJoined ? 'OPEN COURSE' : 'JOIN COURSE'}
        </PixelText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.md, paddingBottom: space.xxl, gap: space.cell },
  row: {
    minHeight: touch * 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.md,
    borderWidth: bevel,
    padding: space.md,
  },
  copy: { minWidth: 0, flexGrow: 1, flexBasis: 360, gap: space.xs },
  titleLine: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.cell },
  title: { minWidth: 0, flexShrink: 1 },
  badge: { flexShrink: 0, borderWidth: bevel, paddingHorizontal: space.cell, paddingVertical: space.hair },
  action: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.cell,
    paddingHorizontal: space.md,
  },
  disabled: { opacity: 0.45 },
});
