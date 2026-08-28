import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePixelTransition } from '@/ui/PixelTransition';
import Head from 'expo-router/head';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { bytesToBase64 } from '@/lib/base64';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { cacheParsedCourse } from '@/lib/courseCache';
import { extractTextFromPDF } from '@/lib/pdfTextExtraction';
import { fetchTree } from '@/features/skilltree/queries';
import { validateGraph } from '@/features/skilltree/validation';
import { usePrefs } from '@/lib/prefs';
import { bevel, space, touch } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { FileDropzone, type FileDropzoneSelection } from '@/ui/FileDropzone';
import {
  LogConsole,
  type LiveLogLine,
  type LiveLogTag,
  type LogTone,
  type SimpleLogLine,
} from '@/ui/LogConsole';
import { PixelProgressBar, type ParseStage } from '@/ui/PixelProgressBar';
import { PixelButton, PixelIcon, PixelInput, PixelText } from '@/ui/pixel';

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
  const { manual } = useLocalSearchParams<{ manual?: string }>();
  const queryClient = useQueryClient();
  const { transition } = usePixelTransition();
  const insets = useSafeAreaInsets();
  const { lowBandwidth, motionOff } = usePrefs();

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [document, setDocument] = useState<SelectedDocument | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState('Waiting for a file');
  const [fileStatusTone, setFileStatusTone] = useState<'idle' | 'ok' | 'bad'>('idle');
  const [log, setLog] = useState<SimpleLogLine[]>([]);
  const [liveLog, setLiveLog] = useState<LiveLogLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [parseStage, setParseStage] = useState<ParseStage>('idle');
  const [parserStatus, setParserStatus] = useState<ParserStatus>('checking');
  const [parserModel, setParserModel] = useState('EDGE ENGINE');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const telemetryStartedAt = useRef(Date.now());

  useEffect(() => {
    if (manual !== '1') return;
    setManualOpen(true);
    router.setParams({ manual: '' });
  }, [manual, router]);

  const say = (text: string, tone: LogTone = 'info') =>
    setLog((prev) => [...prev, { text: `${String(prev.length).padStart(2, '0')}: ${text}`, tone }]);

  const trace = (tag: LiveLogTag, text: string, tone: LogTone = 'info') =>
    setLiveLog((prev) => [...prev, {
      elapsedMs: Date.now() - telemetryStartedAt.current,
      tag,
      text,
      tone,
    }]);

  const beginLogSession = () => {
    telemetryStartedAt.current = Date.now();
    setLog([]);
    setLiveLog([]);
  };

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

  const readFile = async (file: FileDropzoneSelection) => {
    beginLogSession();
    const accepted = /\.(pdf|txt|md)$/i.test(file.name);
    if (!accepted) {
      setSelectedFileName(null);
      setFileStatus('Use a PDF, TXT, or MD file');
      setFileStatusTone('bad');
      say('THAT FILE TYPE IS NOT SUPPORTED', 'bad');
      trace('FILE', `REJECTED ${file.name.toUpperCase()} · ${file.mimeType ?? 'UNKNOWN TYPE'}`, 'bad');
      return;
    }

    setSelectedFileName(file.name);
    setFileStatus('Reading file…');
    setFileStatusTone('idle');
    say(`SELECTED ${file.name.toUpperCase()}`);
    trace(
      'FILE',
      `SELECTED ${file.name.toUpperCase()} · ${file.mimeType ?? 'TYPE UNKNOWN'}${file.size ? ` · ${file.size} BYTES` : ''}`,
    );

    try {
      const fileReadStartedAt = Date.now();
      trace('NETWORK', 'READING LOCAL FILE URI');
      const response = await fetch(file.uri);
      trace(
        'NETWORK',
        `LOCAL FILE RESPONSE ${response.status} · ${Date.now() - fileReadStartedAt} MS`,
        response.ok ? 'ok' : 'bad',
      );
      if (!response.ok) throw new Error(`File read failed with HTTP ${response.status}.`);
      if (/\.pdf$/i.test(file.name) || file.mimeType === 'application/pdf') {
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (bytes.byteLength > 15_000_000) throw new Error('PDF exceeds 15 MB.');
        const base64 = bytesToBase64(bytes);
        setDocument({ name: file.name, mediaType: 'application/pdf', base64 });
        setFileStatus(`${Math.ceil(bytes.byteLength / 1024)} KB PDF ready`);
        setFileStatusTone('ok');
        say(`FILE READY · ${Math.ceil(bytes.byteLength / 1024)} KB PDF`, 'ok');
        trace('FILE', `PDF BUFFER ${bytes.byteLength} BYTES · BASE64 PAYLOAD ${base64.length} CHARACTERS`, 'ok');
        trace('PARSER', 'CLIENT PDF TEXT EXTRACTION STARTED');
        try {
          const extractionStartedAt = Date.now();
          const extracted = await extractTextFromPDF(buffer);
          if (extracted) {
            setText(extracted.text);
            trace(
              'PARSER',
              `EXTRACTED ${extracted.pageCount} PAGES · ${extracted.text.length} CHARACTERS · ${Date.now() - extractionStartedAt} MS${extracted.truncated ? ' · TRUNCATED' : ''}`,
              'ok',
            );
          } else {
            setText('');
            trace('PARSER', 'NO CLIENT TEXT LAYER · GEMINI WILL READ PDF BYTES');
          }
        } catch {
          setText('');
          trace('PARSER', 'CLIENT TEXT EXTRACTION FAILED · GEMINI WILL READ PDF BYTES');
        }
      } else {
        const body = await response.text();
        setText(body);
        setDocument(null);
        setFileStatus(`${body.length} characters ready`);
        setFileStatusTone('ok');
        say(`FILE READY · ${body.length} CHARACTERS`, 'ok');
        trace('FILE', `TEXT PAYLOAD ${body.length} CHARACTERS`, 'ok');
      }
    } catch (cause) {
      setDocument(null);
      setSelectedFileName(null);
      setFileStatus('Could not read that file');
      setFileStatusTone('bad');
      say("COULDN'T READ THAT FILE ON THIS DEVICE", 'bad');
      say('PASTE THE SYLLABUS TEXT BELOW INSTEAD');
      trace('FILE', cause instanceof Error ? cause.message.toUpperCase() : 'FILE READ FAILED', 'bad');
    }
  };

  const parse = async () => {
    if (log.length === 0 && liveLog.length === 0) {
      beginLogSession();
      say(document ? `SELECTED ${document.name.toUpperCase()}` : 'PASTED SYLLABUS TEXT');
      trace(
        'FILE',
        document
          ? `PDF PAYLOAD ${document.base64.length} BASE64 CHARACTERS`
          : `PASTED TEXT ${text.trim().length} CHARACTERS`,
      );
    }
    setBusy(true);
    setParseStage('reading');
    setParserStatus('parsing');
    let createdCourseId: string | null = null;
    let parsed = false;
    try {
      trace('PARSER', `STARTED WITH ${document ? 'PDF DOCUMENT' : 'EXTRACTED TEXT'} INPUT`);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Sign in with Supabase before uploading a live syllabus.');
      trace('NETWORK', 'AUTH SESSION VERIFIED', 'ok');
      const courseCreateStartedAt = Date.now();
      trace('NETWORK', 'POSTING PROVISIONAL COURSE ROW');
      const provisionalTitle = title.trim()
        || selectedFileName?.replace(/\.(pdf|txt|md)$/i, '').trim()
        || 'Imported course';
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({ title: provisionalTitle, owner_id: auth.user.id })
        .select('id')
        .single();
      if (courseError || !course) throw courseError ?? new Error('No course returned.');
      createdCourseId = course.id;
      trace('NETWORK', `COURSE ROW CREATED · ${Date.now() - courseCreateStartedAt} MS`, 'ok');

      const extractedText = text.trim();
      setParseStage('extracting');
      say(`ANALYZING SYLLABUS WITH ${parserModel}`);
      trace(
        'PARSER',
        extractedText
          ? `USING ${extractedText.length} EXTRACTED TEXT CHARACTERS`
          : `USING ${document?.base64.length ?? 0} PDF BASE64 CHARACTERS`,
      );
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
        210_000,
        {
          onRequest: ({ endpoint, requestBytes }) => {
            trace('NETWORK', `POST ${endpointPath(endpoint)} · ${requestBytes} REQUEST BYTES`);
          },
          onResponse: ({ status, durationMs, contentLength }) => {
            trace(
              'NETWORK',
              `HTTP ${status} · HEADERS IN ${durationMs} MS${contentLength === null ? '' : ` · ${contentLength} RESPONSE BYTES`}`,
              status >= 200 && status < 300 ? 'ok' : 'bad',
            );
          },
          onChunk: ({ index, chunkBytes, totalBytes, estimatedTokens }) => {
            trace(
              'STREAM',
              `CHUNK ${index} · ${chunkBytes} BYTES · ${totalBytes} TOTAL · ~${estimatedTokens} JSON TOKENS`,
            );
          },
        },
      );
      if (typeof parseResult.node_count !== 'number') {
        throw new Error('The parser did not return a saved chart.');
      }
      parsed = true;
      setParseStage('building');
      setParserStatus('online');
      trace(
        'DAG',
        `SERVER CHECKPOINT · ${parseResult.node_count} NODES · ${parseResult.edge_count} EDGES · ${parseResult.mission_count ?? 0} MISSIONS`,
        'ok',
      );

      say(`SKILL TREE GENERATED WITH ${parseResult.node_count} NODES`, 'ok');
      try {
        const snapshot = await fetchTree(course.id);
        const validation = validateGraph(snapshot.tree.nodes, snapshot.tree.prereqs);
        trace(
          'DAG',
          validation.isValid
            ? `CLIENT VALIDATION PASSED · ACYCLIC · ${snapshot.tree.nodes.length} NODES · ${snapshot.tree.prereqs.length} EDGES`
            : `CLIENT VALIDATION REPORTED ${validation.errors.length} ISSUE${validation.errors.length === 1 ? '' : 'S'}`,
          validation.isValid ? 'ok' : 'bad',
        );
        await cacheParsedCourse({
          id: course.id,
          courseCode: parseResult.course_code ?? null,
          title: parseResult.course_name || provisionalTitle,
          term: parseResult.semester_description ?? null,
        }, snapshot);
        trace('CACHE', 'DEVICE SNAPSHOT WRITTEN', 'ok');
      } catch (cause) {
        trace(
          'CACHE',
          cause instanceof Error ? `CACHE DEFERRED · ${cause.message.toUpperCase()}` : 'CACHE DEFERRED',
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['courses'] });
      trace('NETWORK', 'COURSE QUERY CACHE INVALIDATED', 'ok');
      setParseStage('complete');
      transition(() => router.navigate({ pathname: '/tree/[courseId]', params: { courseId: course.id } }));
    } catch (err) {
      if (createdCourseId && !parsed) {
        await supabase.from('courses').delete().eq('id', createdCourseId);
        trace('NETWORK', 'PROVISIONAL COURSE ROW REMOVED');
      }
      const message = err instanceof Error ? err.message : String(err);
      setParseStage('error');
      say(message.toUpperCase(), 'bad');
      say('NOTHING WAS SAVED. FIX THE ABOVE AND TRY AGAIN');
      trace('PARSER', message.toUpperCase(), 'bad');
      void checkParserStatus();
    } finally {
      setBusy(false);
    }
  };

  const createBlankCourse = async (courseName: string, courseCode: string) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error('Sign in before creating a course chart.');

    const { data: course, error } = await supabase
      .from('courses')
      .insert({
        title: courseName.trim(),
        course_code: courseCode.trim() || null,
        owner_id: auth.user.id,
      })
      .select('id')
      .single();
    if (error || !course) throw error ?? new Error('The blank course was not created.');

    // A React Native Modal is rendered above the navigation stack. If the
    // upload route stays mounted, its busy modal keeps intercepting every tap
    // on the chart that replaced it.
    setManualOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
    router.replace({
      pathname: '/tree/[courseId]',
      params: { courseId: course.id, edit: '1' },
    });
  };

  const ready = (text.trim().length > 0 || Boolean(document)) && !busy;

  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <DitherField from={t.ground} to={t.panel} bands={7} flat={lowBandwidth} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollBody,
            {
              paddingTop: insets.top + space.md,
              paddingBottom: insets.bottom + space.xl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Head>
            <title>Check in a syllabus · Cardinal Skill</title>
            <meta
              name="description"
              content="Give us a course syllabus and the parser reads it into a chart of what depends on what."
            />
          </Head>

          <View style={styles.content}>
            <View style={styles.intro}>
              <PixelText variant="title">Check in a syllabus</PixelText>
              <PixelText variant="body" colour={t.inkMuted}>
                Choose a syllabus or paste its text. The parser extracts the course details,
                learning modules, missions, and prerequisite chart automatically.
              </PixelText>
            </View>

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

          <FileDropzone
            fileName={selectedFileName}
            status={fileStatus}
            statusTone={fileStatusTone}
            disabled={busy}
            onSelect={readFile}
          />

          <PixelInput
            label="Or paste the syllabus"
            value={text}
            onChangeText={(next) => {
              setText(next);
              if (next.trim()) {
                setDocument(null);
                setSelectedFileName(null);
                setFileStatus('Pasted text ready');
                setFileStatusTone('ok');
              }
            }}
            multiline
            placeholder="Week 1 — Describing data…"
          />

          {parseStage !== 'idle' ? (
            <PixelProgressBar stage={parseStage} reduceMotion={motionOff} />
          ) : null}

          <LogConsole simpleLines={log} liveLines={liveLog} />

          <View style={styles.actions}>
            <PixelButton
              label={busy ? 'Auto-parsing…' : 'Auto-parse course & contents'}
              disabled={!ready}
              onPress={parse}
            />
            <PixelButton
              label="Build the chart by hand"
              tone="panel"
              onPress={() => setManualOpen(true)}
            />
            <PixelButton label="Back" tone="panel" onPress={() => router.back()} />
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ManualCourseModal
        open={manualOpen}
        reduceMotion={motionOff}
        onClose={() => setManualOpen(false)}
        onCreate={createBlankCourse}
      />
    </View>
  );
}

function ManualCourseModal({ open, reduceMotion, onClose, onCreate }: {
  open: boolean;
  reduceMotion: boolean;
  onClose: () => void;
  onCreate: (courseName: string, courseCode: string) => Promise<void>;
}) {
  const t = useTheme();
  const { theme } = useAppTheme();
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCourseName('');
    setCourseCode('');
    setBusy(false);
    setError(null);
  }, [open]);

  const submit = async () => {
    if (!courseName.trim()) {
      setError('Enter the course name, then create the blank chart.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate(courseName, courseCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The blank chart was not created. Try again.');
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={open}
      animationType={reduceMotion ? 'none' : 'fade'}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.manualBackdrop, { backgroundColor: theme.background }]}
        accessibilityViewIsModal
      >
        <View style={[styles.manualPanel, { backgroundColor: theme.hudBackground, borderColor: theme.border }]}>
          <View style={styles.manualHeader}>
            <View style={styles.manualHeading}>
              <PixelText variant="title" colour={t.ink}>Start a blank chart</PixelText>
              <PixelText variant="body" colour={t.inkMuted}>
                Name the course now. You will add and connect nodes directly on the canvas.
              </PixelText>
            </View>
            <Pressable
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Close blank chart setup"
              style={({ pressed }) => [
                styles.manualClose,
                {
                  borderColor: theme.border,
                  backgroundColor: pressed ? theme.surfaceHover : theme.surface,
                },
              ]}
            >
              <PixelIcon name="close" size={16} colour={t.ink} />
            </Pressable>
          </View>

          <View style={styles.manualFields}>
            <PixelInput
              label="Course name"
              value={courseName}
              onChangeText={setCourseName}
              placeholder="Discrete Mathematics"
              autoFocus
            />
            <PixelInput
              label="Course code (optional)"
              value={courseCode}
              onChangeText={setCourseCode}
              placeholder="CS201"
              autoCapitalize="characters"
            />
          </View>

          {error ? <PixelText variant="body" colour={t.alarm}>{error}</PixelText> : null}
          <View style={styles.manualActions}>
            <PixelButton label="Cancel" tone="panel" grow={false} disabled={busy} onPress={onClose} />
            <PixelButton
              label={busy ? 'Creating chart…' : 'Create blank chart'}
              grow={false}
              disabled={busy || !courseName.trim()}
              onPress={submit}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
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
      <PixelText variant="micro" colour={colour} style={styles.parserStatusText}>{label}</PixelText>
    </View>
  );
}

function endpointPath(endpoint: string): string {
  try {
    return new URL(endpoint).pathname;
  } catch {
    return endpoint;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  scroll: { flex: 1, width: '100%', alignSelf: 'stretch' },
  scrollBody: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: space.md },
  intro: { width: '100%', gap: space.xs },
  actions: { width: '100%', gap: space.cell },
  parserStatus: {
    minHeight: 28,
    minWidth: 0,
    maxWidth: '100%',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: bevel,
    paddingHorizontal: space.cell,
  },
  parserStatusText: { minWidth: 0, flexShrink: 1 },
  statusDot: { width: 8, height: 8 },
  manualBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
  manualPanel: { width: '100%', maxWidth: 520, borderWidth: bevel, padding: space.md, gap: space.md },
  manualHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  manualHeading: { minWidth: 0, flex: 1, gap: space.xs },
  manualClose: {
    width: touch,
    height: touch,
    borderWidth: bevel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualFields: { gap: space.md },
  manualActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space.cell,
  },
});
