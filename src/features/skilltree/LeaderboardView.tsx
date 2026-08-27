import { StyleSheet, View } from 'react-native';

import type { LeaderboardEntry } from './recordQueries';
import { bevel, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Bevel, PixelButton, PixelIcon, PixelText } from '@/ui/pixel';

interface Props {
  entries: readonly LeaderboardEntry[];
  pending: boolean;
  error: boolean;
  available: boolean;
  visibility: boolean | null | undefined;
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
  visibility,
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
        <PixelText variant="label">No live ladder for practice charts</PixelText>
        <PixelText variant="body" colour={t.inkMuted}>
          Live rankings need a signed-in student account and an enrolled course. Practice charts never invent classmates.
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

  return (
    <View style={styles.view}>
      <Bevel tone="panel" depth="inset" style={styles.privacy}>
        <View style={styles.privacyCopy}>
          <PixelText variant="label">Leaderboard visibility</PixelText>
          <PixelText variant="micro" colour={t.inkMuted}>
            Only students who explicitly join are visible to classmates. Your own rank remains visible to you.
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
      ) : (
        <>
          <View style={styles.podium}>
            {podium.map((entry) => <PodiumCard key={entry.rank} entry={entry} />)}
          </View>
          {ranked.length > 0 ? (
            <View style={styles.rows}>
              {ranked.map((entry) => <LeaderboardRow key={entry.rank} entry={entry} />)}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function PodiumCard({ entry }: { entry: LeaderboardEntry }) {
  const t = useTheme();
  const edge = entry.rank === 1 ? t.warning : entry.rank === 2 ? t.inkMuted : t.locate;
  const rankText = entry.rank === 3 ? t.ink : edge;
  return (
    <View
      style={[styles.podiumCard, { backgroundColor: t.well, borderColor: edge }]}
      accessible
      accessibilityLabel={`Rank ${entry.rank}, ${entry.displayName}, level ${entry.level}, ${entry.xp} XP`}
    >
      <View style={styles.podiumRank}>
        <PixelIcon name={entry.rank === 1 ? 'crown' : 'stamp'} size={16} colour={edge} />
        <PixelText variant="label" colour={rankText}>{String(entry.rank).padStart(2, '0')}</PixelText>
      </View>
      <PixelIcon name="user" size={24} colour={entry.isCurrentUser ? t.warning : t.info} />
      <PixelText variant="body" colour={t.ink} centred numberOfLines={2}>{entry.displayName}</PixelText>
      {entry.isCurrentUser ? <PixelText variant="micro" colour={t.warning}>YOU</PixelText> : null}
      <PixelText variant="micro" colour={t.inkMuted}>LVL {entry.level}</PixelText>
      <PixelText variant="label" colour={t.warning}>{entry.xp.toLocaleString()} XP</PixelText>
    </View>
  );
}

export function LeaderboardRow({ entry, sticky = false }: { entry: LeaderboardEntry; sticky?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: t.panel, borderColor: entry.isCurrentUser || sticky ? t.locate : t.line },
      ]}
      accessible
      accessibilityLabel={`Rank ${entry.rank}, ${entry.displayName}, level ${entry.level}, ${entry.mastered} of ${entry.totalNodes} cleared, ${entry.streak} day streak, ${entry.xp} XP${entry.isCurrentUser ? ', you' : ''}`}
    >
      <View style={styles.identity}>
        <PixelText variant="label" colour={entry.isCurrentUser ? t.warning : t.inkMuted}>
          {String(entry.rank).padStart(2, '0')}
        </PixelText>
        <PixelIcon name="user" size={16} colour={entry.isCurrentUser ? t.warning : t.info} />
        <View style={styles.name}>
          <PixelText variant="body" colour={t.ink} numberOfLines={1}>{entry.displayName}</PixelText>
          {entry.isCurrentUser ? <PixelText variant="micro" colour={t.warning}>YOU</PixelText> : null}
        </View>
      </View>
      <View style={styles.progress}>
        <PixelText variant="micro" colour={t.ink}>LVL {entry.level}</PixelText>
        <PixelText variant="micro" colour={t.inkMuted}>{entry.mastered}/{entry.totalNodes} CLEARED</PixelText>
      </View>
      <View style={styles.score}>
        <View style={styles.streak}>
          <PixelIcon name="flame" size={12} colour={entry.streak > 0 ? t.alarm : t.inkMuted} />
          <PixelText variant="micro" colour={t.inkMuted}>{entry.streak}D</PixelText>
        </View>
        <PixelText variant="label" colour={t.warning}>{entry.xp.toLocaleString()} XP</PixelText>
      </View>
    </View>
  );
}

export function LeaderboardStickyBar({ entry }: { entry: LeaderboardEntry }) {
  return (
    <View pointerEvents="box-none" style={styles.stickyDock}>
      <View style={styles.stickyWidth}>
        <LeaderboardRow entry={entry} sticky />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: space.md },
  state: { padding: space.md, gap: space.cell },
  privacy: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md, padding: space.md },
  privacyCopy: { minWidth: 0, flex: 1, gap: space.xs },
  podium: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: space.cell },
  podiumCard: { minWidth: 0, flexBasis: 180, flexGrow: 1, minHeight: 196, alignItems: 'center', justifyContent: 'center', gap: space.xs, borderWidth: bevel, padding: space.cell },
  podiumRank: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rows: { gap: space.xs },
  row: { minHeight: 72, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.cell, borderWidth: bevel, padding: space.cell },
  identity: { minWidth: 180, flex: 2, flexDirection: 'row', alignItems: 'center', gap: space.cell },
  name: { minWidth: 0, flex: 1 },
  progress: { minWidth: 112, flex: 1, gap: space.hair },
  score: { minWidth: 104, alignItems: 'flex-end', gap: space.hair },
  streak: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  stickyDock: { position: 'absolute', left: space.md, right: space.md, bottom: space.md, zIndex: 30, alignItems: 'center' },
  stickyWidth: { width: '100%', maxWidth: 768 },
});
