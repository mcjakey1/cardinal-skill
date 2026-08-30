import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';

import { MissionCardActions } from './MissionCardActions';
import { missionDifficulty, type MissionBoardRow } from './missionBoard';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Bevel, PixelIcon, PixelText, StatusTag } from '@/ui/pixel';

interface Props {
  row: MissionBoardRow;
  showCourse: boolean;
  canEdit: boolean;
  claiming: boolean;
  reduceMotion: boolean;
  onLocate: () => void;
  onToggle: () => void;
  onEdit: () => void;
}

export function MissionCard({ row, showCourse, canEdit, claiming, reduceMotion, onLocate, onToggle, onEdit }: Props) {
  const t = useTheme();
  const { mission, node, state } = row;
  const difficulty = missionDifficulty(mission, node);
  const difficultyColour = difficulty === 'easy' ? t.success : difficulty === 'medium' ? t.warning : t.alarm;

  return (
    <Bevel tone="panel" style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <View style={styles.statusRow}>
            <StatusTag status={state === 'done' ? 'mastered' : state === 'open' ? 'available' : 'locked'} />
            {showCourse ? <PixelText variant="micro" colour={t.info}>{row.courseTitle.toUpperCase()}</PixelText> : null}
          </View>
          <PixelText variant="title" colour={state === 'locked' ? t.inkMuted : t.ink}>
            {mission.title}
          </PixelText>
          <PixelText variant="micro" colour={t.inkMuted}>
            NODE · {node.title.toUpperCase()}
          </PixelText>
        </View>
        <View style={[styles.reward, { backgroundColor: t.well, borderColor: t.warning }]}>
          <PixelText variant="micro" colour={t.warning}>+{mission.xpReward} XP</PixelText>
        </View>
      </View>

      {mission.description ? (
        <PixelText variant="body" colour={state === 'locked' ? t.inkMuted : t.ink}>
          {mission.description}
        </PixelText>
      ) : null}

      <View style={styles.badges}>
        <View style={[styles.badge, { borderColor: difficultyColour, backgroundColor: t.well }]}>
          <PixelText variant="micro" colour={difficultyColour}>{difficulty.toUpperCase()}</PixelText>
        </View>
        <View style={[styles.badge, { borderColor: t.line, backgroundColor: t.well }]}>
          <PixelText variant="micro" colour={t.inkMuted}>
            {mission.estimatedMinutes ? `${mission.estimatedMinutes} MIN` : 'TIME NOT SET'}
          </PixelText>
        </View>
        <View style={[styles.badge, { borderColor: t.line, backgroundColor: t.well }]}>
          <PixelText variant="micro" colour={t.inkMuted}>{mission.kind.toUpperCase()}</PixelText>
        </View>
      </View>

      {state === 'locked' ? (
        <View style={[styles.requires, { backgroundColor: t.well, borderColor: t.line }]}>
          <PixelIcon name="lock" size={12} colour={t.inkMuted} />
          <PixelText variant="micro" colour={t.inkMuted} style={styles.flexText}>
            REQUIRES: {row.missingPrerequisites.length > 0
              ? row.missingPrerequisites.join(', ').toUpperCase()
              : 'PREREQUISITE WORK'}
          </PixelText>
        </View>
      ) : null}

      <MissionCardActions
        row={row}
        canEdit={canEdit}
        onLocate={onLocate}
        onToggle={onToggle}
        onEdit={onEdit}
      />

      {claiming ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeInUp.duration(160)}
          exiting={reduceMotion ? undefined : FadeOutUp.duration(180)}
          style={[styles.claim, { backgroundColor: t.earned }]}
          accessibilityLiveRegion="polite"
        >
          <PixelIcon name="check" size={14} colour={t.well} />
          <PixelText variant="label" colour={t.well}>+{mission.xpReward} XP REGISTERED</PixelText>
        </Animated.View>
      ) : null}
    </Bevel>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.md, gap: space.cell, position: 'relative', overflow: 'hidden' },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: space.cell },
  headingCopy: { minWidth: 0, flex: 1, gap: space.xs },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.cell },
  reward: { minHeight: 28, justifyContent: 'center', borderWidth: bevel, paddingHorizontal: space.cell, paddingVertical: space.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  badge: { minHeight: 28, borderWidth: bevel, justifyContent: 'center', paddingHorizontal: space.cell },
  requires: { minHeight: touch, flexDirection: 'row', alignItems: 'center', gap: space.cell, borderWidth: bevel, padding: space.cell },
  flexText: { minWidth: 0, flex: 1 },
  claim: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.cell },
});
