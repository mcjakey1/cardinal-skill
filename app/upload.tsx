import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { usePixelTransition } from '@/ui/PixelTransition';
import Head from 'expo-router/head';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { bytesToBase64 } from '@/lib/base64';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { cacheParsedCourse } from '@/lib/courseCache';
import { extractTextFromPDF } from '@/lib/pdfTextExtraction';
import { fetchTree } from '@/features/skilltree/queries';
import { usePrefs } from '@/lib/prefs';
import { bevel, space } from '@/theme/tokens';
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
type SelectedDocument = { name: string; mediaType: 'application/pdf'; base64: string };
interface ParseResult {
  course_id: string;
  course_code: string | null;
  course_name: string;
  course_description?: string | null;
  semester_description: string | null;
  units?: number | null;
  node_count: number;
  mission_count: number;
  edge_count: number;
}
interface ParserStatusResponse {
  status: 'online';
  model?: string;
}
type ParserStatus = 'checking' | 'online' | 'parsing' | 'offline';

export default function Upload() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { transition } = usePixelTransition();
  const insets = useSafeAreaInsets();
  const { lowBandwidth } = usePrefs();

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [document, setDocument] = useState<SelectedDocument | null>(null);
  const [log, setLog] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [parserStatus, setParserStatus] = useState<ParserStatus>('checking');
  const [parserModel, setParserModel] = useState('EDGE ENGINE');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const say = (text: string, tone: Line['tone'] = 'info') =>
    setLog((prev) => [...prev, { text: `${String(prev.length).padStart(2, '0')}: ${text}`, tone }]);

  const checkParserStatus = useCallback(async () => {
    setParserStatus('checking');
    try {
      const result = await callEdgeFunction<ParserStatusResponse>(
        'parse-syllabus',
        { action: 'status' },
        12_000,
      );
      setParserModel(result.model ? result.model.replaceAll('-', ' ').toUpperCase() : 'EDGE ENGINE');
      setParserStatus('online');
    } catch {
      setParserStatus('offline');
    }
  }, []);

  useEffect(() => {
    void checkParserStatus();
  }, [checkParserStatus]);

  useEffect(() => {
    if (!busy) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const intervalId = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [busy]);

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

    if (file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      say('DOCX IS NOT SUPPORTED BY THE LIVE PARSER YET', 'bad');
      say('EXPORT IT AS A TEXT-BASED PDF OR PASTE THE SYLLABUS TEXT');
      return;
    }

    try {
      const response = await fetch(file.uri);
      if (!response.ok) throw new Error(`File read failed with HTTP ${response.status}.`);
      if (file.mimeType === 'application/pdf') {
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (bytes.byteLength > 15_000_000) throw new Error('PDF exceeds 15 MB.');
        setDocument({ name: file.name, mediaType: 'application/pdf', base64: bytesToBase64(bytes) });
        say(`READ ${Math.ceil(bytes.byteLength / 1024)} KB PDF`, 'ok');
        say('EXTRACTING SELECTABLE PDF TEXT');
        try {
          const extracted = await extractTextFromPDF(buffer);
          if (extracted) {
            setText(extracted.text);
            say(`EXTRACTED ${extracted.pageCount} PAGES · ${extracted.text.length} CHARACTERS`, 'ok');
            if (extracted.truncated) say('TEXT WAS LIMITED TO THE PARSER MAXIMUM');
          } else {
            setText('');
            say('NO CLIENT TEXT LAYER FOUND · OPENROUTER PDF PIPELINE WILL READ THE DOCUMENT');
          }
        } catch {
          setText('');
          say('CLIENT TEXT EXTRACTION FAILED · OPENROUTER PDF PIPELINE WILL READ THE DOCUMENT');
        }
      } else {
        const body = await response.text();
        setText(body);
        setDocument(null);
        say(`READ ${body.length} CHARACTERS`, 'ok');
      }
    } catch {
      say("COULDN'T READ THAT FILE ON THIS DEVICE", 'bad');
      say('PASTE THE SYLLABUS TEXT BELOW INSTEAD');
    }
  };

  const parse = async () => {
    setBusy(true);
    setParserStatus('parsing');
    let createdCourseId: string | null = null;
    let parsed = false;
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Sign in with Supabase before uploading a live syllabus.');
      say('CREATING COURSE');
      const provisionalTitle = title.trim()
        || document?.name.replace(/\.pdf$/i, '').trim()
        || 'Imported course';
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({ title: provisionalTitle, owner_id: auth.user.id })
        .select('id')
        .single();
      if (courseError || !course) throw courseError ?? new Error('No course returned.');
      createdCourseId = course.id;

      const extractedText = text.trim();
      say(extractedText ? 'AUTO-PARSING COURSE AND CONTENTS' : 'READING PDF AND AUTO-PARSING COURSE');
      const parseResult = await callEdgeFunction<ParseResult>(
        'parse-syllabus',
        {
          courseId: course.id,
          syllabusText: extractedText || undefined,
          // Prefer extracted text; preserve the original PDF as the native and
          // scanned-document fallback without uploading both representations.
          documentBase64: extractedText ? undefined : document?.base64,
          documentMediaType: extractedText ? undefined : document?.mediaType,
          documentName: extractedText ? undefined : document?.name,
        },
        140_000,
      );
      if (typeof parseResult.node_count !== 'number') {
        throw new Error('The parser did not return a saved chart.');
      }
      parsed = true;
      setParserStatus('online');

      say(
        `DETECTED ${parseResult.course_code ? `${parseResult.course_code} · ` : ''}${parseResult.course_name.toUpperCase()}${parseResult.units ? ` · ${parseResult.units} UNITS` : ''}`,
        'ok',
      );
      say(`SAVED ${parseResult.node_count} NODES AND ${parseResult.mission_count ?? 0} MISSIONS`, 'ok');
      try {
        const snapshot = await fetchTree(course.id);
        await cacheParsedCourse({
          id: course.id,
          courseCode: parseResult.course_code ?? null,
          title: parseResult.course_name || provisionalTitle,
          term: parseResult.semester_description ?? null,
        }, snapshot);
        say('CHART DRAWN AND CACHED', 'ok');
      } catch {
        say('CHART SAVED; DEVICE CACHE WILL RETRY WHEN OPENED', 'info');
      }
      await queryClient.invalidateQueries({ queryKey: ['courses'] });
      transition(() => router.navigate({ pathname: '/tree/[courseId]', params: { courseId: course.id } }));
    } catch (err) {
      if (createdCourseId && !parsed) {
        await supabase.from('courses').delete().eq('id', createdCourseId);
      }
      const message = err instanceof Error ? err.message : String(err);
      say(message.toUpperCase(), 'bad');
      say('NOTHING WAS SAVED. FIX THE ABOVE AND TRY AGAIN');
      void checkParserStatus();
    } finally {
      setBusy(false);
    }
  };

  const ready = (text.trim().length > 0 || Boolean(document)) && !busy;

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
            Choose a syllabus or paste its text. The parser extracts the course details,
            learning modules, missions, and prerequisite chart automatically.
          </PixelText>

          <ParserStatusPill
            status={parserStatus}
            model={parserModel}
            elapsedSeconds={elapsedSeconds}
          />

          <PixelInput
            label="Course name override (optional)"
            value={title}
            onChangeText={setTitle}
            placeholder="Leave blank to extract it from the syllabus"
          />

          <PixelButton label="Choose a file" tone="panel" onPress={pick} />

          <PixelInput
            label="Or paste the syllabus"
            value={text}
            onChangeText={(next) => {
              setText(next);
              if (next.trim()) setDocument(null);
            }}
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
              label={busy ? 'Auto-parsing…' : 'Auto-parse course & contents'}
              disabled={!ready}
              onPress={parse}
            />
            <PixelButton
              label="Build the chart by hand"
              tone="panel"
              onPress={() => transition(() => router.navigate('/author'))}
            />
            <PixelButton label="Back" tone="panel" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ParserStatusPill({
  status,
  model,
  elapsedSeconds,
}: {
  status: ParserStatus;
  model: string;
  elapsedSeconds: number;
}) {
  const t = useTheme();
  const colour = status === 'online'
    ? t.success
    : status === 'offline'
      ? t.alarm
      : t.warning;
  const label = status === 'online'
    ? `PARSER CONNECTED · ${model}`
    : status === 'parsing'
      ? `PARSING SYLLABUS · ${elapsedSeconds}S`
      : status === 'offline'
        ? 'PARSER OFFLINE · RETRY CONNECTION'
        : 'CHECKING PARSER CONNECTION…';
  return (
    <View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      style={[styles.parserStatus, { borderColor: colour }]}
    >
      <View style={[styles.statusDot, { backgroundColor: colour }]} />
      <PixelText variant="micro" colour={colour}>{label}</PixelText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  body: { padding: space.md, gap: space.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  actions: { gap: space.cell, marginTop: space.cell, paddingBottom: space.xl },
  parserStatus: {
    minHeight: 28,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: bevel,
    paddingHorizontal: space.cell,
  },
  statusDot: { width: 8, height: 8 },
});
