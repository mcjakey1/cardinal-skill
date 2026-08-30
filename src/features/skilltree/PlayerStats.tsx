import { StyleSheet, View } from 'react-native';

import type { ActivityCell } from './recordAnalytics';
import { bevel, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Bevel, Meter, PixelIcon, PixelText } from '@/ui/pixel';

interface Props {
  level: number;
  title: string;
  xp: number;
  availableXp: number;
  levelProgress: number;
  mastered: number;
  totalNodes: number;
  streak: number;
  rank: number | null;
  participants: number;
  rankLabel: string;
  activity: readonly ActivityCell[];
  velocity: number;
  estimatedDays: number | null;
}

export function PlayerStats(props: Props) {
  const t = useTheme();
  const cleared = props.totalNodes === 0 ? 0 : Math.round((props.mastered / props.totalNodes) * 100);
  const estimate = props.estimatedDays === 0
    ? 'Scope cleared.'
    : props.estimatedDays === null
      ? 'Clear another node to estimate completion.'
      : `Estimated completion in ${props.estimatedDays} ${props.estimatedDays === 1 ? 'day' : 'days'}.`;

  return (
    <View style={styles.view}>
      <Bevel tone="panel" style={styles.overview}>
        <View style={styles.levelBlock}>
          <PixelText variant="display" colour={t.ink}>LVL {props.level}</PixelText>
          <View style={[styles.titleTag, { backgroundColor: t.well, borderColor: t.warning }]}>
            <PixelText variant="micro" colour={t.warning}>{props.title.toUpperCase()}</PixelText>
          </View>
        </View>
        <View style={styles.levelMeter}>
          <Meter
            value={props.levelProgress}
            cells={20}
            colour={t.locate}
            label={`Level ${props.level}, ${Math.round(props.levelProgress * 100)} percent to next level`}
          />
          <PixelText variant="micro" colour={t.inkMuted}>
            {Math.round(props.levelProgress * 100)}% TO NEXT LEVEL
          </PixelText>
        </View>

        <View style={styles.figures}>
          <Figure label="Total XP" value={`${props.xp.toLocaleString()} / ${props.availableXp.toLocaleString()}`} />
          <Figure label="Nodes mastered" value={`${props.mastered} / ${props.totalNodes} · ${cleared}%`} />
          <Figure label="Active streak" value={props.streak > 0 ? `${props.streak} days` : 'No active streak'} icon="flame" />
          <Figure
            label={props.rankLabel}
            value={props.rank ? `#${props.rank} of ${props.participants}` : 'Not ranked'}
            icon="crown"
          />
        </View>
      </Bevel>

      <Bevel tone="panel" depth="inset" style={styles.activity}>
        <View style={styles.sectionHead}>
          <PixelText variant="label">Study activity</PixelText>
          <PixelText variant="micro" colour={t.inkMuted}>LAST 14 DAYS</PixelText>
        </View>
        <View
          style={styles.punchCard}
          accessibilityRole="summary"
          accessibilityLabel={`${props.activity.filter((cell) => cell.active).length} active study days in the last ${props.activity.length} days`}
        >
          {props.activity.map((cell) => (
            <View key={cell.key} style={styles.day}>
              <View style={[styles.dayCell, { backgroundColor: cell.active ? t.success : t.well, borderColor: cell.active ? t.success : t.line }]} />
              <PixelText variant="micro" colour={cell.active ? t.success : t.inkMuted}>{cell.label}</PixelText>
            </View>
          ))}
        </View>
      </Bevel>

      <Bevel tone="panel" depth="inset" style={styles.velocity}>
        <View style={styles.velocityHead}>
          <PixelIcon name="play" size={14} colour={t.warning} />
          <PixelText variant="label" colour={t.warning}>{props.velocity.toFixed(1)} NODES / WEEK</PixelText>
        </View>
        <PixelText variant="body" colour={t.ink}>{estimate}</PixelText>
        <PixelText variant="micro" colour={t.inkMuted}>
          Based on mastered nodes recorded during the last 28 days.
        </PixelText>
      </Bevel>
    </View>
  );
}

function Figure({ label, value, icon }: { label: string; value: string; icon?: 'flame' | 'crown' }) {
  const t = useTheme();
  return (
    <View style={styles.figure}>
      <View style={styles.figureValue}>
        {icon ? <PixelIcon name={icon} size={12} colour={icon === 'flame' ? t.alarm : t.warning} /> : null}
        <PixelText variant="body" colour={t.ink}>{value}</PixelText>
      </View>
      <PixelText variant="micro" colour={t.inkMuted}>{label.toUpperCase()}</PixelText>
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: space.md },
  overview: { padding: space.md, gap: space.md },
  levelBlock: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.cell },
  titleTag: { borderWidth: bevel, paddingHorizontal: space.cell, paddingVertical: space.xs },
  levelMeter: { gap: space.xs },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  figure: { minWidth: 180, flex: 1, gap: space.hair },
  figureValue: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  activity: { padding: space.md, gap: space.cell },
  sectionHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: space.cell },
  punchCard: { flexDirection: 'row', flexWrap: 'wrap', gap: space.cell },
  day: { alignItems: 'center', gap: space.hair },
  dayCell: { width: 20, height: 20, borderWidth: bevel },
  velocity: { padding: space.md, gap: space.xs },
  velocityHead: { flexDirection: 'row', alignItems: 'center', gap: space.cell },
});
