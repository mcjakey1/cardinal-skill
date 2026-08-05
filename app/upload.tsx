import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { usePrefs } from '@/lib/prefs';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { Window } from '@/ui/Window';
import { PixelButton, PixelInput, PixelText } from '@/ui/pixel';

/**
 * Check in a syllabus.
 *
 * The parser takes syllabus *text*, not a file — extraction happens wherever the
 * text comes from, and on a phone that is either a plain-text file or the
 * clipboard. A PDF is accepted by the picker and then reported honestly rather
 * than silently producing an empty parse.
 *
 * Every line in the log below is written when the step actually happened. This
 * screen has no simulated progress.
 */
type Line = { text: string; tone: 'info' | 'ok' | 'bad' };

export default function Upload() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lowBandwidth } = usePrefs();

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [log, setLog] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  const say = (text: string, tone: Line['tone'] = 'info') =>
    setLog((prev) => [...prev, { text: `${String(prev.length).padStart(2, '0')}: ${text}`, tone }]);

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'text/plain',
        'text/markdown',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const file = result.assets[0];
    if (!file) return;
    say(`SELECTED ${file.name.toUpperCase()}`);

    if (file.mimeType && !file.mimeType.startsWith('text/')) {
      say('PDF AND DOCX TEXT IS EXTRACTED SERVER-SIDE, WHICH IS NOT WIRED', 'bad');
      say('PASTE THE SYLLABUS TEXT BELOW INSTEAD');
      return;
    }

    try {
      const body = await (await fetch(file.uri)).text();
      setText(body);
      say(`READ ${body.length} CHARACTERS`, 'ok');
    } catch {
      say("COULDN'T READ THAT FILE ON THIS DEVICE", 'bad');
      say('PASTE THE SYLLABUS TEXT BELOW INSTEAD');
    }
  };

  const parse = async () => {
    setBusy(true);
    try {
      say('CREATING COURSE');
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({ title: title.trim() })
        .select('id')
        .single();
      if (courseError || !course) throw courseError ?? new Error('No course returned.');

      say('PARSING SYLLABUS');
      const { error } = await supabase.functions.invoke('parse-syllabus', {
        body: { courseId: course.id, syllabusText: text },
      });
      if (error) throw error;

      say('CHART DRAWN', 'ok');
      router.navigate({ pathname: '/tree/[courseId]', params: { courseId: course.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      say(message.toUpperCase(), 'bad');
      say('NOTHING WAS SAVED. FIX THE ABOVE AND TRY AGAIN');
    } finally {
      setBusy(false);
    }
  };

  const ready = title.trim().length > 0 && text.trim().length > 0 && !busy;

  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <DitherField from={t.ground} to={t.panel} bands={7} flat={lowBandwidth} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + space.cell }]}>
          <Head>
            <title>Check in a syllabus · Cardinal Skill</title>
            <meta
              name="description"
              content="Give us a course syllabus and the parser reads it into a chart of what depends on what."
            />
          </Head>

          <PixelText variant="title">Check in a syllabus</PixelText>
          <PixelText variant="body" colour={t.inkMuted}>
            Name the course and give us its text. The parser reads it into a chart of what
            depends on what.
          </PixelText>

          <PixelInput
            label="Course name"
            value={title}
            onChangeText={setTitle}
            placeholder="Statistics 101"
          />

          <PixelButton label="Choose a file" tone="panel" onPress={pick} />

          <PixelInput
            label="Or paste the syllabus"
            value={text}
            onChangeText={setText}
            multiline
            placeholder="Week 1 — Describing data…"
          />

          {log.length > 0 ? (
            <Window title="Log" live={false}>
              {log.map((line, i) => (
                <PixelText
                  key={i}
                  variant="body"
                  colour={
                    line.tone === 'bad'
                      ? t.alarm
                      : line.tone === 'ok'
                        ? t.earnedText
                        : t.inkMuted
                  }
                >
                  {line.text}
                </PixelText>
              ))}
            </Window>
          ) : null}

          <View style={styles.actions}>
            <PixelButton
              label={busy ? 'Working…' : 'Draw the chart'}
              disabled={!ready}
              onPress={parse}
            />
            <PixelButton
              label="Build the chart by hand"
              tone="panel"
              onPress={() => router.navigate('/author')}
            />
            <PixelButton label="Back" tone="panel" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  body: { padding: space.md, gap: space.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  actions: { gap: space.cell, marginTop: space.cell, paddingBottom: space.xl },
});
