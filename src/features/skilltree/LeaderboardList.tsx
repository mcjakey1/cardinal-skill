import { StyleSheet, View } from 'react-native';

import type { LeaderboardEntry } from './recordQueries';
import { getLeaderboardLadderRanks } from './recordLadder';
import { bevel, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelIcon, PixelText } from '@/ui/pixel';

interface LeaderboardListProps {
  entries: readonly LeaderboardEntry[];
  participantCount: number;
}

export function LeaderboardList({ entries, participantCount }: LeaderboardListProps) {
  const entryByRank = new Map(entries.map((entry) => [entry.rank, entry]));
  const ranks = getLeaderboardLadderRanks(participantCount, entries.map((entry) => entry.rank));
  const finalRank = ranks.at(-1) ?? 10;

  return (
    <View
      style={styles.list}
      accessibilityRole="list"
      accessibilityLabel={`Leaderboard ranks 4 through ${finalRank}`}
    >
      {ranks.map((rank) => {
        const entry = entryByRank.get(rank);
        return entry ? <LeaderboardRow key={rank} entry={entry} /> : <OpenSlotRow key={rank} rank={rank} />;
      })}
    </View>
  );
}

export function LeaderboardRow({ entry, sticky = false }: { entry: LeaderboardEntry; sticky?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: sticky ? t.well : t.panel,
          borderColor: entry.isCurrentUser || sticky ? t.locate : t.line,
        },
      ]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Rank ${entry.rank}, ${entry.displayName}, level ${entry.level}, ${entry.mastered} of ${entry.totalNodes} cleared, ${entry.streak} day streak, ${entry.xp} XP${entry.isCurrentUser ? ', you' : ''}`}
    >
      <View style={styles.identity}>
        <PixelText variant="label" colour={entry.isCurrentUser ? t.warning : t.inkMuted}>
          {String(entry.rank).padStart(2, '0')}
        </PixelText>
        <View style={[styles.avatar, { backgroundColor: t.well, borderColor: entry.isCurrentUser ? t.locate : t.line }]}>
          <PixelIcon name="user" size={16} colour={entry.isCurrentUser ? t.warning : t.info} />
        </View>
        <View style={styles.name}>
          <PixelText variant="body" colour={t.ink} numberOfLines={2}>{entry.displayName}</PixelText>
          <PixelText variant="micro" colour={entry.isCurrentUser ? t.warning : t.inkMuted}>
            {entry.isCurrentUser ? 'YOU · ' : ''}{entry.mastered}/{entry.totalNodes} CLEARED
          </PixelText>
        </View>
      </View>
      <View style={styles.score}>
        <View style={[styles.level, { backgroundColor: t.well, borderColor: t.line }]}>
          <PixelText variant="micro" colour={t.inkMuted}>LVL {entry.level}</PixelText>
        </View>
        <PixelText variant="label" colour={t.warning}>{entry.xp.toLocaleString()} XP</PixelText>
        <View style={styles.momentum}>
          <PixelIcon name="flame" size={12} colour={entry.streak > 0 ? t.alarm : t.inkMuted} />
          <PixelText variant="micro" colour={t.inkMuted}>{entry.streak}D</PixelText>
        </View>
      </View>
    </View>
  );
}

function OpenSlotRow({ rank }: { rank: number }) {
  const t = useTheme();
  return (
    <View
      style={[styles.row, styles.openRow, { backgroundColor: t.ground, borderColor: t.line }]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Rank ${rank}, open slot, 0 XP`}
    >
      <View style={styles.identity}>
        <PixelText variant="label" colour={t.inkMuted}>{String(rank).padStart(2, '0')}</PixelText>
        <View style={[styles.avatar, styles.openAvatar, { backgroundColor: t.well, borderColor: t.line }]}>
          <PixelText variant="micro" colour={t.inkMuted}>?</PixelText>
        </View>
        <View style={styles.name}>
          <PixelText variant="micro" colour={t.inkMuted}>-- OPEN SLOT --</PixelText>
        </View>
      </View>
      <View style={styles.scoreLine}>
        <PixelText variant="micro" colour={t.inkMuted}>--</PixelText>
        <PixelText variant="label" colour={t.inkMuted}>0 XP</PixelText>
      </View>
    </View>
  );
}

export function LeaderboardStickyBar({ entry }: { entry: LeaderboardEntry }) {
  return (
    <View pointerEvents="box-none" style={styles.stickyDock}>
      <View pointerEvents="none" style={styles.stickyWidth}>
        <LeaderboardRow entry={entry} sticky />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xs },
  row: {
    minHeight: space.xxl + space.cell,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.cell,
    borderWidth: bevel,
    paddingHorizontal: space.md,
    paddingVertical: space.cell,
  },
  openRow: { borderStyle: 'dashed' },
  identity: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  avatar: {
    width: space.xl,
    height: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: bevel,
  },
  openAvatar: { borderStyle: 'dashed' },
  name: { minWidth: 0, flex: 1 },
  score: { alignItems: 'flex-end', gap: space.hair },
  scoreLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  level: { borderWidth: bevel, paddingHorizontal: space.cell, paddingVertical: space.hair },
  momentum: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  stickyDock: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.md,
    zIndex: 30,
    alignItems: 'center',
  },
  stickyWidth: { width: '100%', maxWidth: 680 },
});
