import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { bevel, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelText } from './pixel';

export type ParseStage = 'idle' | 'reading' | 'extracting' | 'building' | 'complete' | 'error';

const SEGMENTS = 12;
const STAGE: Record<ParseStage, { label: string; value: number }> = {
  idle: { label: 'Ready', value: 0 },
  reading: { label: 'Reading file…', value: 0.18 },
  extracting: { label: 'Extracting topics…', value: 0.55 },
  building: { label: 'Building skill tree…', value: 0.84 },
  complete: { label: 'Complete!', value: 1 },
  error: { label: 'Parser stopped', value: 0 },
};

export function PixelProgressBar({ stage, reduceMotion }: { stage: ParseStage; reduceMotion: boolean }) {
  const t = useTheme();
  const target = Math.round(STAGE[stage].value * SEGMENTS);
  const [filled, setFilled] = useState(target);

  useEffect(() => {
    if (reduceMotion) {
      setFilled(target);
      return;
    }
    const timer = setInterval(() => {
      setFilled((current) => {
        if (current === target) {
          clearInterval(timer);
          return target;
        }
        if (current > target) {
          clearInterval(timer);
          return target;
        }
        return current + 1;
      });
    }, 80);
    return () => clearInterval(timer);
  }, [reduceMotion, target]);

  const fill = stage === 'complete' ? t.success : stage === 'error' ? t.alarm : t.warning;
  const value = Math.round((filled / SEGMENTS) * 100);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={STAGE[stage].label}
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={styles.wrap}
    >
      <View style={styles.heading}>
        <PixelText variant="label" colour={fill}>{STAGE[stage].label}</PixelText>
        <PixelText variant="micro" colour={t.inkMuted}>{value}%</PixelText>
      </View>
      <View style={[styles.track, { borderColor: t.line, backgroundColor: t.well }]}>
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <View
            key={index}
            style={[
              styles.segment,
              {
                borderColor: t.line,
                backgroundColor: index < filled ? fill : t.panel,
              },
            ]}
          />
        ))}
      </View>
      <PixelText variant="micro" colour={t.inkMuted}>
        {stage === 'complete' ? 'CHART READY' : `${filled} OF ${SEGMENTS} BLOCKS`}
      </PixelText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: space.xs },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: {
    height: space.xl,
    flexDirection: 'row',
    gap: space.hair,
    borderWidth: bevel,
    padding: space.xs,
  },
  segment: { flex: 1, borderWidth: bevel },
});
