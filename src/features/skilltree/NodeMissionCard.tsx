import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { missionDifficulty } from './missionBoard';
import type { MissionState } from './missions';
import type { Mission, SkillNode } from './types';
import { bevel, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Bevel, PixelButton, PixelIcon, PixelText } from '@/ui/pixel';

interface Props {
  mission: Mission;
  node: SkillNode;
  state: MissionState;
  claimed: boolean;
  reduceMotion: boolean;
  onToggle: () => void;
  onHint: () => void;
  onCriteria: () => void;
}

export function NodeMissionCard({
  mission,
  node,
  state,
  claimed,
  reduceMotion,
  onToggle,
  onHint,
  onCriteria,
}: Props) {
  const t = useTheme();
  const difficulty = missionDifficulty(mission, node);
  const difficultyColour = difficulty === 'easy' ? t.success : difficulty === 'medium' ? t.warning : t.alarm;
  const disabled = state === 'locked';
  const done = state === 'done';

  return (
    <Bevel tone="panel" depth="raised" style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.titleBlock}>
          <View style={[styles.difficulty, { borderColor: difficultyColour, backgroundColor: t.well }]}>
            <PixelText variant="micro" colour={difficultyColour}>{difficulty.toUpperCase()}</PixelText>
          </View>
          <PixelText variant="body" colour={disabled ? t.inkMuted : t.ink} style={styles.title}>
            {mission.title}
          </PixelText>
        </View>
        <View style={styles.xpReadout}>
          {done ? <PixelIcon name="check" size={12} colour={t.earnedText} /> : null}
          <PixelText variant="label" colour={done ? t.earnedText : t.warning}>
            {mission.xpReward} XP
          </PixelText>
        </View>
      </View>

      <PixelText variant="micro" colour={t.inkMuted}>
        {[mission.estimatedMinutes ? `${mission.estimatedMinutes} MIN` : null, mission.kind]
          .filter(Boolean)
          .join(' · ')
          .toUpperCase()}
      </PixelText>

      <View style={[styles.objective, { borderColor: t.line }]}>
        <PixelText variant="micro" colour={t.info}>OBJECTIVE</PixelText>
        <PixelText variant="body" colour={disabled ? t.inkMuted : t.ink} style={styles.description}>
          {mission.description || 'Complete the mission described by your instructor.'}
        </PixelText>
      </View>

      {!disabled ? (
        <View style={styles.secondaryActions}>
          <PixelButton label="Get hint" tone="panel" grow={false} style={styles.secondaryButton} onPress={onHint} />
          <PixelButton label="View criteria" tone="panel" grow={false} style={styles.secondaryButton} onPress={onCriteria} />
        </View>
      ) : null}

      <PixelButton
        label={done
          ? 'Mission complete · Undo'
          : disabled
            ? 'Locked · Clear prerequisites'
            : `Complete mission & claim ${mission.xpReward} XP`}
        tone="brand"
        disabled={disabled}
        onPress={onToggle}
      />

      {claimed ? <ClaimFeedback xp={mission.xpReward} reduceMotion={reduceMotion} /> : null}
    </Bevel>
  );
}

function ClaimFeedback({ xp, reduceMotion }: { xp: number; reduceMotion: boolean }) {
  const t = useTheme();
  const rise = useSharedValue(0);
  useEffect(() => {
    rise.value = withTiming(1, { duration: reduceMotion ? 0 : 700 });
  }, [reduceMotion, rise]);
  const motion = useAnimatedStyle(() => ({
    opacity: 1 - rise.value,
    transform: [{ translateY: -space.md * rise.value }],
  }));
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(100)}
      exiting={reduceMotion ? undefined : FadeOut.duration(100)}
      style={[styles.claim, motion]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <PixelText variant="label" colour={t.earnedText}>+{xp} XP CLAIMED</PixelText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.cell, gap: space.cell, position: 'relative' },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.cell },
  titleBlock: { flex: 1, minWidth: 0, gap: space.xs },
  title: { flexShrink: 1 },
  xpReadout: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  difficulty: { minHeight: 28, alignSelf: 'flex-start', borderWidth: bevel, justifyContent: 'center', paddingHorizontal: space.cell },
  objective: { gap: space.xs, borderTopWidth: bevel, borderBottomWidth: bevel, paddingVertical: space.cell },
  description: { fontSize: 13, lineHeight: 18, flexWrap: 'wrap' },
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.cell },
  secondaryButton: { minWidth: 132, flexGrow: 1 },
  claim: { position: 'absolute', right: space.cell, top: space.cell, zIndex: 2 },
});
