import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Bevel, PixelText, bevelStyle, type PressState } from './pixel';

export type LogTone = 'info' | 'ok' | 'bad';
export type LiveLogTag = 'FILE' | 'NETWORK' | 'STREAM' | 'PARSER' | 'DAG' | 'CACHE';

export interface SimpleLogLine {
  text: string;
  tone: LogTone;
}

export interface LiveLogLine {
  elapsedMs: number;
  tag: LiveLogTag;
  text: string;
  tone: LogTone;
}

type LogMode = 'simple' | 'live';

export function LogConsole({
  simpleLines,
  liveLines,
}: {
  simpleLines: readonly SimpleLogLine[];
  liveLines: readonly LiveLogLine[];
}) {
  const t = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [mode, setMode] = useState<LogMode>('simple');
  const lineCount = mode === 'simple' ? simpleLines.length : liveLines.length;

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(timer);
  }, [lineCount, mode]);

  return (
    <Bevel tone="panel" depth="raised" style={styles.console}>
      <View style={[styles.header, { backgroundColor: t.brand }]}>
        <PixelText variant="label" colour={t.tone.brand.ink} numberOfLines={1} style={styles.title}>
          LOG
        </PixelText>
        <View accessibilityRole="radiogroup" accessibilityLabel="Log detail" style={styles.modeSwitch}>
          {(['simple', 'live'] as const).map((option) => {
            const active = option === mode;
            const label = option === 'simple' ? '[ SIMPLE ]' : '[ LIVE ]';
            return (
              <Pressable
                key={option}
                onPress={() => setMode(option)}
                accessibilityRole="radio"
                accessibilityLabel={`${option} log mode`}
                accessibilityState={{ checked: active }}
                style={({ pressed, hovered }: PressState) => [
                  styles.modeButton,
                  bevelStyle(t, active ? 'brand' : 'panel', pressed || active ? 'inset' : 'raised'),
                  hovered && !pressed && !active ? { backgroundColor: t.tone.panel.light } : null,
                ]}
              >
                <PixelText
                  variant="micro"
                  colour={active ? t.tone.brand.ink : t.inkMuted}
                  centred
                >
                  {label}
                </PixelText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        style={[styles.viewport, { backgroundColor: t.well }]}
        accessibilityLiveRegion={mode === 'simple' ? 'polite' : 'none'}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {mode === 'simple' ? (
            simpleLines.length > 0 ? simpleLines.map((line, index) => (
              <PixelText key={`${index}-${line.text}`} variant="body" colour={toneColour(t, line.tone)}>
                {line.text}
              </PixelText>
            )) : (
              <PixelText variant="body" colour={t.inkMuted}>00: Waiting for a syllabus</PixelText>
            )
          ) : (
            liveLines.length > 0 ? liveLines.map((line, index) => (
              <PixelText
                key={`${index}-${line.elapsedMs}-${line.tag}`}
                variant="micro"
                colour={toneColour(t, line.tone)}
                selectable
              >
                {`${formatElapsed(line.elapsedMs)} [${line.tag}] ${line.text}`}
              </PixelText>
            )) : (
              <PixelText variant="micro" colour={t.inkMuted}>
                [00.00s] [PARSER] WAITING FOR ACTIVITY
              </PixelText>
            )
          )}
        </ScrollView>
      </View>
    </Bevel>
  );
}

function formatElapsed(elapsedMs: number): string {
  return `[${(Math.max(0, elapsedMs) / 1000).toFixed(2).padStart(5, '0')}s]`;
}

function toneColour(theme: ReturnType<typeof useTheme>, tone: LogTone): string {
  return tone === 'bad' ? theme.alarm : tone === 'ok' ? theme.earnedText : theme.inkMuted;
}

const styles = StyleSheet.create({
  console: { width: '100%' },
  header: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.cell,
    gap: space.cell,
  },
  title: { minWidth: 0, flexShrink: 1 },
  modeSwitch: { flexDirection: 'row', alignSelf: 'stretch' },
  modeButton: {
    minWidth: touch + space.lg,
    minHeight: touch,
    paddingHorizontal: space.cell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewport: {
    height: touch * 3 + space.lg,
    margin: space.xs,
    padding: space.md,
  },
  scroll: { flex: 1 },
  content: { gap: space.xs, paddingRight: space.cell },
});
