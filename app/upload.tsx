import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePixelTransition } from '@/ui/PixelTransition';
import Head from 'expo-router/head';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { cacheParsedCourse } from '@/lib/courseCache';
import {
  checkParserStatus as fetchParserStatus,
  readSyllabusFile,
  runSyllabusImport,
  type SyllabusDocument,
  type SyllabusReadEvent,
} from '@/lib/syllabusImport';
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
  const [document, setDocument] = useState<SyllabusDocument | null>(null);
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
      const result = await fetchParserStatus();
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

  const traceRead = (event: SyllabusReadEvent) => {
    switch (event.kind) {
      case 'fetching':
        return trace('NETWORK', 'READING LOCAL FILE URI');
      case 'fetched':
        return trace(
          'NETWORK',
          `LOCAL FILE RESPONSE ${event.status} · ${event.durationMs} MS`,
          event.status >= 200 && event.status < 300 ? 'ok' : 'bad',
        );
      case 'pdf':
        return trace('FILE', `PDF BUFFER ${event.bytes} BYTES · BASE64 PAYLOAD ${event.base64Length} CHARACTERS`, 'ok');
      case 'extracting':
        return trace('PARSER', 'CLIENT PDF TEXT EXTRACTION STARTED');
      case 'extracted':
        return trace(
          'PARSER',
          `EXTRACTED ${event.pageCount} PAGES · ${event.characters} CHARACTERS · ${event.durationMs} MS${event.truncated ? ' · TRUNCATED' : ''}`,
          'ok',
        );
      case 'no-text-layer':
        return trace('PARSER', 'NO CLIENT TEXT LAYER · THE PARSER WILL READ PDF BYTES');
      case 'extract-failed':
        return trace('PARSER', 'CLIENT TEXT EXTRACTION FAILED · THE PARSER WILL READ PDF BYTES');
      case 'text':
        return trace('FILE', `TEXT PAYLOAD ${event.characters} CHARACTERS`, 'ok');
    }
  };

  const readFile = async (file: FileDropzoneSelection) => {
    beginLogSession();
    setSelectedFileName(file.name);
    setFileStatus('Reading file…');
    setFileStatusTone('idle');
    say(`SELECTED ${file.name.toUpperCase()}`);
    trace(
      'FILE',
      `SELECTED ${file.name.toUpperCase()} · ${file.mimeType ?? 'TYPE UNKNOWN'}${file.size ? ` · ${file.size} BYTES` : ''}`,
    );

    try {
      const selection = await readSyllabusFile(file, traceRead);
      setDocument(selection.document);
      setText(selection.text);
      setFileStatus(selection.status);
      setFileStatusTone('ok');
      say(`FILE READY · ${selection.status.toUpperCase()}`, 'ok');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'That file could not be read.';
      setDocument(null);
      setSelectedFileName(null);
      setFileStatus(message);
      setFileStatusTone('bad');
      say(message.toUpperCase(), 'bad');
      trace('FILE', message.toUpperCase(), 'bad');
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
    try {
      trace('PARSER', `STARTED WITH ${document ? 'PDF DOCUMENT' : 'EXTRACTED TEXT'} INPUT`);
      const extractedText = text.trim();
      const { courseId, title: provisionalTitle, result: parseResult } =
        await runSyllabusImport(
          { titleOverride: title, fileName: selectedFileName, text, document },
          {
            onStage: (stage) => {
              if (stage === 'creating') {
                trace('NETWORK', 'POSTING PROVISIONAL COURSE ROW');
                return;
              }
              if (stage === 'parsing') {
                setParseStage('extracting');
                say(`ANALYZING SYLLABUS WITH ${parserModel}`);
                trace(
                  'PARSER',
                  extractedText
                    ? `USING ${extractedText.length} EXTRACTED TEXT CHARACTERS`
                    : `USING ${document?.base64.length ?? 0} PDF BASE64 CHARACTERS`,
                );
                return;
              }
              if (stage === 'discarded') trace('NETWORK', 'PROVISIONAL COURSE ROW REMOVED');
            },
            telemetry: {
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
          },
        );
      setParseStage('building');
      setParserStatus('online');
      trace(
        'DAG',
        `SERVER CHECKPOINT · ${parseResult.node_count} NODES · ${parseResult.edge_count} EDGES · ${parseResult.mission_count ?? 0} MISSIONS`,
        'ok',
      );

      say(`SKILL TREE GENERATED WITH ${parseResult.node_count} NODES`, 'ok');
      try {
        const snapshot = await fetchTree(courseId);
        const validation = validateGraph(snapshot.tree.nodes, snapshot.tree.prereqs);
        trace(
          'DAG',
          validation.isValid
            ? `CLIENT VALIDATION PASSED · ACYCLIC · ${snapshot.tree.nodes.length} NODES · ${snapshot.tree.prereqs.length} EDGES`
            : `CLIENT VALIDATION REPORTED ${validation.errors.length} ISSUE${validation.errors.length === 1 ? '' : 'S'}`,
          validation.isValid ? 'ok' : 'bad',
        );
        await cacheParsedCourse({
          id: courseId,
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
      transition(() => router.navigate({ pathname: '/tree/[courseId]', params: { courseId } }));
    } catch (err) {
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
