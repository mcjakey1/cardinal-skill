import { StyleSheet, View } from 'react-native';

import type { Achievement } from './achievements';
import { bevel, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Meter, PixelIcon, PixelText } from '@/ui/pixel';

export function StampsList({ stamps }: { stamps: readonly Achievement[] }) {
  const t = useTheme();
  const earned = stamps.filter((stamp) => stamp.earned).length;
  return (
    <View style={styles.list}>
      <View style={styles.heading}>
        <PixelText variant="title">Stamps</PixelText>
        <PixelText variant="micro" colour={t.inkMuted}>{earned} OF {stamps.length} EARNED</PixelText>
      </View>
      {stamps.map((stamp) => (
        <View
          key={stamp.id}
          style={[
            styles.stamp,
            {
              backgroundColor: t.well,
              borderColor: stamp.earned ? t.warning : t.line,
            },
          ]}
          accessible
          accessibilityLabel={`${stamp.title}. ${stamp.earned ? 'Earned' : 'Locked'}. ${stamp.detail}`}
        >
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <PixelIcon name={stamp.earned ? 'stamp' : 'lock'} size={16} colour={stamp.earned ? t.warning : t.inkMuted} />
              <PixelText variant="label" colour={stamp.earned ? t.warning : t.inkMuted}>{stamp.title}</PixelText>
            </View>
            <PixelText variant="body" colour={stamp.earned ? t.ink : t.inkMuted}>{stamp.detail}</PixelText>
            {stamp.earned ? null : (
              <Meter
                value={stamp.progress}
                cells={10}
                colour={t.info}
                label={`${stamp.title}: ${Math.round(stamp.progress * 100)} percent complete`}
              />
            )}
          </View>
          <PixelText variant="micro" colour={stamp.earned ? t.success : t.inkMuted}>
            {stamp.earned ? 'EARNED' : stamp.target > 0 ? `${stamp.current}/${stamp.target}` : 'NOT AVAILABLE'}
          </PixelText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.cell },
  heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.cell, marginTop: space.cell },
  stamp: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, borderWidth: bevel, padding: space.md },
  copy: { minWidth: 0, flex: 1, gap: space.cell },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.cell },
});
