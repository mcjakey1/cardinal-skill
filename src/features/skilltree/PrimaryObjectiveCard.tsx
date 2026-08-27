import { Pressable, StyleSheet, View } from 'react-native';

import type { MissionBoardRow } from './missionBoard';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelIcon, PixelText, type PressState } from '@/ui/pixel';

interface Props {
  row: MissionBoardRow | undefined;
  showCourse: boolean;
  onStart: () => void;
}

export function PrimaryObjectiveCard({ row, showCourse, onStart }: Props) {
  const t = useTheme();
  const accent = row ? t.locate : t.success;

  return (
    <View style={[styles.card, { backgroundColor: t.well, borderColor: accent }]}>
      <View style={styles.copy}>
        <View style={styles.header}>
          <PixelIcon name={row ? 'play' : 'check'} size={12} colour={accent} />
          <PixelText variant="micro" colour={accent}>PRIMARY OBJECTIVE</PixelText>
        </View>
        {row ? (
          <>
            <PixelText variant="title" colour={t.ink}>{row.mission.title}</PixelText>
            <PixelText variant="micro" colour={t.inkMuted}>
              {[showCourse ? row.courseTitle : null, row.node.title, row.mission.estimatedMinutes ? `${row.mission.estimatedMinutes} MIN` : null, `+${row.mission.xpReward} XP`]
                .filter(Boolean).join(' · ').toUpperCase()}
            </PixelText>
          </>
        ) : (
          <PixelText variant="body" colour={t.inkMuted}>No unlocked mission is waiting.</PixelText>
        )}
      </View>

      {row ? (
        <Pressable
          onPress={onStart}
          accessibilityRole="button"
          accessibilityLabel={`Start ${row.mission.title}`}
          style={({ pressed, hovered }: PressState) => [
            styles.start,
            {
              backgroundColor: pressed || hovered ? t.warning : t.locate,
              borderColor: pressed ? t.locate : t.warning,
            },
          ]}
        >
          <PixelText variant="micro" colour={t.locateInk}>START MISSION</PixelText>
          <PixelIcon name="play" size={12} colour={t.locateInk} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 104,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.md,
    borderWidth: bevel,
    padding: space.md,
  },
  copy: { minWidth: 0, flex: 1, gap: space.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.cell },
  start: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.cell,
    borderWidth: bevel,
    paddingHorizontal: space.md,
    paddingVertical: space.cell,
  },
});
