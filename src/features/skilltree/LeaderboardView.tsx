import { StyleSheet, View } from 'react-native';

import type { LeaderboardEntry } from './recordQueries';
import type { CourseKind } from './courseDistribution';
import { LeaderboardList } from './LeaderboardList';
import { LeaderboardPodium } from './LeaderboardPodium';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Bevel, PixelButton, PixelText } from '@/ui/pixel';

interface Props {
  entries: readonly LeaderboardEntry[];
  pending: boolean;
  error: boolean;
  available: boolean;
  courseKind: CourseKind | null;
  unavailableTitle: string;
  unavailableMessage: string;
  visibility: boolean | null | undefined;
  /** Verified instructors are ranked only if they ask to be; the copy says so. */
  isInstructor: boolean;
  visibilityPending: boolean;
  visibilityError: boolean;
  onVisibilityChange: (visible: boolean) => void;
  onVisibilityRetry: () => void;
  onRetry: () => void;
}

export function LeaderboardView({
  entries,
  pending,
  error,
  available,
  courseKind,
  unavailableTitle,
  unavailableMessage,
  visibility,
  isInstructor,
  visibilityPending,
  visibilityError,
  onVisibilityChange,
  onVisibilityRetry,
  onRetry,
}: Props) {
  const t = useTheme();
  if (!available) {
    return (
      <Bevel tone="panel" depth="inset" style={styles.state}>
        <PixelText variant="label">{unavailableTitle}</PixelText>
        <PixelText variant="body" colour={t.inkMuted}>
          {unavailableMessage}
        </PixelText>
      </Bevel>
    );
  }
  if (pending) {
    return (
      <Bevel tone="panel" style={styles.state}>
        <PixelText variant="body" colour={t.inkMuted}>READING LIVE RANKS</PixelText>
      </Bevel>
    );
  }
  if (error) {
    return (
      <Bevel tone="panel" style={[styles.state, { borderColor: t.alarm }]}>
        <PixelText variant="label" colour={t.alarm}>Leaderboard unavailable</PixelText>
        <PixelText variant="body" colour={t.ink}>Check your connection and try again.</PixelText>
        <PixelButton label="Retry leaderboard" tone="panel" grow={false} onPress={onRetry} />
      </Bevel>
    );
  }

  const podium = entries.filter((entry) => entry.rank <= 3);
  const ranked = entries.filter((entry) => entry.rank >= 4 && entry.rank <= 50);
  const participantCount = entries.reduce(
    (count, entry) => Math.max(count, entry.participantCount, entry.rank),
    0,
  );

  return (
    <View style={styles.view}>
      <Bevel tone="panel" depth="inset" style={styles.scopeLabel}>
        <PixelText variant="micro" colour={courseKind === 'community' ? t.brand : t.inkMuted}>
          {courseKind === 'community'
            ? 'STUDENT-MADE COURSE · UNOFFICIAL LEADERBOARD · ISOLATED XP'
            : 'OFFICIAL COURSE · VERIFIED LEADERBOARD · ISOLATED XP'}
        </PixelText>
      </Bevel>
      <Bevel tone="panel" depth="inset" style={styles.privacy}>
        <View style={styles.privacyCopy}>
          <PixelText variant="label">
            {isInstructor ? 'Instructor ranking is off by default' : 'Leaderboard visibility'}
          </PixelText>
          <PixelText variant="micro" colour={t.inkMuted}>
            {isInstructor
              ? 'Join to rank with the class in courses you do not own. You never appear in a course you wrote.'
              : 'Only students who explicitly join are visible to classmates. Your own rank remains visible to you.'}
          </PixelText>
        </View>
        {visibilityError ? (
          <PixelButton
            label="Retry visibility"
            tone="panel"
            grow={false}
            disabled={visibilityPending}
            onPress={onVisibilityRetry}
          />
        ) : visibility === null ? (
          <PixelText variant="micro" colour={t.inkMuted}>SIGN IN TO JOIN</PixelText>
        ) : visibility === undefined ? (
          <PixelText variant="micro" colour={t.inkMuted}>READING VISIBILITY</PixelText>
        ) : (
          <PixelButton
            label={visibility ? 'Leave leaderboard' : 'Join leaderboard'}
            tone={visibility ? 'panel' : 'brand'}
            grow={false}
            disabled={visibilityPending}
            onPress={() => onVisibilityChange(!visibility)}
          />
        )}
      </Bevel>

      {entries.length === 0 ? (
        <Bevel tone="panel" style={styles.state}>
          <PixelText variant="label">No participants yet</PixelText>
          <PixelText variant="body" colour={t.inkMuted}>
            The ladder appears as classmates opt in.
          </PixelText>
        </Bevel>
      ) : null}

      <View style={styles.board}>
        <LeaderboardPodium entries={podium} />
        <LeaderboardList entries={ranked} participantCount={participantCount} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  view: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    gap: space.md,
    paddingBottom: space.xl + space.cell,
  },
  board: { gap: space.cell },
  state: { padding: space.md, gap: space.cell },
  scopeLabel: { paddingHorizontal: space.md, paddingVertical: space.cell },
  privacy: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md, padding: space.md },
  privacyCopy: { minWidth: 0, flex: 1, gap: space.xs },
});
