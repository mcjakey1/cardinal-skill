import { StyleSheet, View } from 'react-native';

import type { LeaderboardEntry } from './recordQueries';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelIcon, PixelText } from '@/ui/pixel';

const PODIUM_ORDER = [2, 1, 3] as const;

export function LeaderboardPodium({ entries }: { entries: readonly LeaderboardEntry[] }) {
  return (
    <View
      style={styles.podium}
      accessibilityRole="summary"
      accessibilityLabel={`Leaderboard podium with ${Math.min(entries.length, 3)} ranked students`}
    >
      {PODIUM_ORDER.map((rank) => (
        <PodiumPlace
          key={rank}
          rank={rank}
          entry={entries.find((candidate) => candidate.rank === rank)}
        />
      ))}
    </View>
  );
}

function PodiumPlace({ rank, entry }: { rank: 1 | 2 | 3; entry?: LeaderboardEntry }) {
  const t = useTheme();
  const edge = rank === 1 ? t.warning : rank === 2 ? t.inkMuted : t.locate;
  const score = rank === 3 ? t.ink : edge;
  const pedestalHeight = rank === 1
    ? space.xxl * 3
    : rank === 2
      ? space.xxl * 3 - space.xl
      : space.xxl * 2 + space.lg;

  if (!entry) {
    return (
      <View
        style={styles.place}
        accessible
        accessibilityLabel={`Rank ${rank} is open`}
      >
        <View style={[styles.emptyAvatar, { borderColor: t.line }]}>
          <PixelIcon name="user" size={16} colour={t.inkMuted} />
        </View>
        <View
          style={[
            styles.pedestal,
            styles.emptyPedestal,
            { minHeight: pedestalHeight, backgroundColor: t.well, borderColor: t.line },
          ]}
        >
          <RankBadge rank={rank} edge={t.line} ink={t.inkMuted} />
          <PixelText variant="micro" colour={t.inkMuted} centred>OPEN SLOT</PixelText>
        </View>
      </View>
    );
  }

  return (
    <View
      style={styles.place}
      accessible
      accessibilityLabel={`Rank ${rank}, ${entry.displayName}, level ${entry.level}, ${entry.xp} XP${entry.isCurrentUser ? ', you' : ''}`}
    >
      {rank === 1 ? <PixelIcon name="crown" size={16} colour={t.warning} /> : null}
      <View style={[styles.avatar, { backgroundColor: t.panel, borderColor: edge }]}>
        <PixelIcon name="user" size={24} colour={entry.isCurrentUser ? t.warning : t.info} />
        <View style={[styles.avatarBadge, { backgroundColor: t.panel, borderColor: edge }]}>
          <PixelText variant="micro" colour={score}>{rank}</PixelText>
        </View>
      </View>
      <View
        style={[
          styles.pedestal,
          { minHeight: pedestalHeight, backgroundColor: t.well, borderColor: edge },
        ]}
      >
        <RankBadge rank={rank} edge={edge} ink={score} />
        <View style={styles.identity}>
          <PixelText variant="body" colour={t.ink} centred numberOfLines={2}>
            {entry.displayName}
          </PixelText>
          {entry.isCurrentUser ? <PixelText variant="micro" colour={t.warning} centred>YOU</PixelText> : null}
        </View>
        <View style={styles.score}>
          <PixelText variant="label" colour={score} centred>{entry.xp.toLocaleString()} XP</PixelText>
          <PixelText variant="micro" colour={t.inkMuted} centred>LVL {entry.level}</PixelText>
        </View>
      </View>
    </View>
  );
}

function RankBadge({ rank, edge, ink }: { rank: number; edge: string; ink: string }) {
  return (
    <View style={[styles.rankBadge, { borderColor: edge }]}>
      <PixelText variant="micro" colour={ink}>RANK {rank}</PixelText>
    </View>
  );
}

const styles = StyleSheet.create({
  podium: {
    minHeight: space.xxl * 7,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.xs,
  },
  place: { minWidth: 0, flex: 1, alignItems: 'center', gap: space.xs },
  avatar: {
    width: touch,
    height: touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: bevel,
  },
  emptyAvatar: {
    width: touch,
    height: touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: bevel,
    borderStyle: 'dashed',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -space.cell,
    minWidth: space.lg,
    height: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: bevel,
  },
  pedestal: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
    borderWidth: bevel,
    paddingHorizontal: space.xs,
    paddingVertical: space.cell,
  },
  emptyPedestal: { justifyContent: 'center', borderStyle: 'dashed' },
  rankBadge: {
    minHeight: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: bevel,
    paddingHorizontal: space.xs,
  },
  identity: { minWidth: 0, alignItems: 'center', gap: space.hair },
  score: { alignItems: 'center', gap: space.hair },
});
