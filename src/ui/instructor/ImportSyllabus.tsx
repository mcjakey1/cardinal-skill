import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  checkParserStatus,
  instructorImportError,
  readSyllabusFile,
  runSyllabusImport,
  type SyllabusDocument,
} from '@/lib/syllabusImport';
import { fetchInstructorVerification, publishOfficialCourse } from '@/features/skilltree/courseCatalog';
import { LmsFileDropzone, type LmsFileSelection } from '@/ui/LmsFileDropzone';
import {
  Field,
  LButton,
  LText,
  Meter,
  Notice,
  Panel,
} from '@/ui/lms';
import { PageHead, useInstructorStyles } from './shared';

type ImportPhase = 'idle' | 'creating' | 'parsing' | 'publishing' | 'done';

const PHASE_COPY: Record<Exclude<ImportPhase, 'idle'>, { label: string; percent: number }> = {
  creating: { label: 'Setting up the new course…', percent: 12 },
  parsing: { label: 'Reading the syllabus and building the course tree…', percent: 55 },
  publishing: { label: 'Publishing the course to the official catalog…', percent: 88 },
  done: { label: 'Done. Opening the course…', percent: 100 },
};

export function ImportSyllabus({
  liveSession,
  onDrawn,
  onSignIn,
}: {
  liveSession: boolean;
  onDrawn: (courseId: string) => void;
  onSignIn: () => void;
}) {
  const styles = useInstructorStyles();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [document, setDocument] = useState<SyllabusDocument | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState('No file selected');
  const [fileTone, setFileTone] = useState<'idle' | 'ok' | 'bad'>('idle');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [publishFailure, setPublishFailure] = useState<string | null>(null);
  // Set only once a course has parsed and saved. While it holds an id the
  // course exists and must never be imported a second time: a fresh press
  // would parse the same syllabus into a duplicate course.
  const [unpublishedCourseId, setUnpublishedCourseId] = useState<string | null>(null);

  // Ask the parser whether it is awake before anyone picks a file. An import
  // that was going to fail on a parser that is off should say so on arrival,
  // not four minutes into a spinner.
  const parser = useQuery({
    queryKey: ['parser-status'],
    queryFn: checkParserStatus,
    enabled: liveSession,
    retry: false,
    staleTime: 60_000,
  });

  // Read up front so the screen can say, before the instructor presses anything,
  // whether this import will reach students. The same key backs the chart
  // toolbar's publish dialog, so the answer is fetched once per session.
  const verification = useQuery({
    queryKey: ['instructor-verification'],
    queryFn: fetchInstructorVerification,
    enabled: liveSession,
  });

  useEffect(() => {
    if (!busy) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const ready =
    liveSession && !unpublishedCourseId && (text.trim().length > 0 || Boolean(document)) && !busy;

  const readFile = async (file: LmsFileSelection) => {
    setFailure(null);
    setFileName(file.name);
    setFileStatus('Reading the file…');
    setFileTone('idle');
    try {
      const selection = await readSyllabusFile(file);
      setDocument(selection.document);
      setText(selection.text);
      setFileStatus(selection.status);
      setFileTone('ok');
    } catch (cause) {
      // The reason belongs on the picker, next to the file it is about. The
      // notice below is reserved for a failed import, and nothing was imported.
      setDocument(null);
      setFileName(null);
      setFileStatus(instructorImportError(cause));
      setFileTone('bad');
    }
  };

  /**
   * Publish when this account may. Returns false only when publishing was owed
   * and did not happen, which is the one case that keeps the instructor here.
   */
  const publishWhenVerified = async (courseId: string): Promise<boolean> => {
    try {
      // `fetchQuery` rather than the hook above, so a still-loading
      // verification cannot silently skip publication.
      const verified = await queryClient.fetchQuery({
        queryKey: ['instructor-verification'],
        queryFn: fetchInstructorVerification,
      });
      // The server RPC stays the only thing that can flip the kind: an
      // unverified caller's course simply stays the private practice course it
      // was created as.
      if (verified) await publishOfficialCourse(courseId);
      await queryClient.invalidateQueries({ queryKey: ['course-catalog'] });
      setPublishFailure(null);
      return true;
    } catch (cause) {
      setPublishFailure(instructorImportError(cause));
      return false;
    }
  };

  const submit = async () => {
    if (!liveSession || unpublishedCourseId) return;
    setBusy(true);
    setPhase('creating');
    setFailure(null);
    setPublishFailure(null);
    try {
      const outcome = await runSyllabusImport(
        { titleOverride: title, fileName, text, document },
        {
          onStage: (stage) => {
            if (stage === 'creating' || stage === 'parsing') setPhase(stage);
          },
        },
      );

      setPhase('publishing');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['instructor-courses'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
      ]);

      // An import by a verified instructor is meant to reach students, so
      // publication is not a second button they have to find.
      if (!(await publishWhenVerified(outcome.courseId))) {
        // Stay put. Navigating on to the chart would hide the one message
        // saying students cannot see this course yet — and the course is real,
        // so the way forward is to publish it again, never to import it again.
        setUnpublishedCourseId(outcome.courseId);
        setPhase('idle');
        return;
      }

      setPhase('done');
      onDrawn(outcome.courseId);
    } catch (cause) {
      setPhase('idle');
      setFailure(instructorImportError(cause));
      // A parse can fail because the parser went away mid-run; re-ask, so the
      // banner above the form tells the truth on the next attempt.
      void parser.refetch();
    } finally {
      setBusy(false);
    }
  };

  const retryPublish = async () => {
    if (!unpublishedCourseId) return;
    setBusy(true);
    setPhase('publishing');
    const published = await publishWhenVerified(unpublishedCourseId);
    setPhase('idle');
    setBusy(false);
    if (published) {
      const courseId = unpublishedCourseId;
      setUnpublishedCourseId(null);
      onDrawn(courseId);
    }
  };

  const parserOffline = liveSession && parser.isError;

  return (
    <>
      <PageHead
        title="Import a syllabus"
        lede="Upload a PDF, text, or Markdown syllabus. Cardinal reads its topics and prerequisites into a course tree, then publishes it to the official catalog when this account is a verified instructor."
      />

      {parserOffline ? (
        <Notice tone="error" title="The syllabus reader is not answering">
          <View style={styles.noticeActions}>
            <LText variant="small">
              {instructorImportError(parser.error)} Nothing has been lost. Try again in a moment, and
              if it keeps failing, tell whoever set up this project that the syllabus parser is
              unreachable.
            </LText>
            <LButton label="Try again" icon="refresh-cw" onPress={() => void parser.refetch()} />
          </View>
        </Notice>
      ) : null}

      {liveSession && verification.data === false ? (
        <Notice tone="attention" title="This import will stay private">
          This account cannot publish to the official catalog: it either registered as a student, or
          an administrator withdrew its publishing rights. The course is still created and still
          editable — students just cannot find it until an administrator restores them.
        </Notice>
      ) : null}

      {liveSession && verification.isError ? (
        <Notice tone="error" title="Verification could not be checked">
          <View style={styles.noticeActions}>
            <LText variant="small">
              Importing still works, but this screen cannot say whether the new course will reach
              students. {instructorImportError(verification.error)}
            </LText>
            <LButton label="Check again" icon="refresh-cw" onPress={() => void verification.refetch()} />
          </View>
        </Notice>
      ) : null}

      {!liveSession ? (
        <Notice tone="attention" title="Sign in to import a live course">
          <View style={styles.noticeActions}>
            <LText variant="small">
              You are using the local instructor demo. Syllabus parsing and saved courses require a
              Supabase instructor account so the new course has a verified owner.
            </LText>
            <LButton label="Go to sign in" icon="log-in" onPress={onSignIn} />
          </View>
        </Notice>
      ) : null}

      <Panel>
        <View style={styles.panelBody}>
          <LmsFileDropzone
            fileName={fileName}
            status={fileStatus}
            statusTone={fileTone}
            disabled={busy || !liveSession}
            onSelect={readFile}
          />

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <LText variant="micro" tone="muted">or paste text</LText>
            <View style={styles.divider} />
          </View>

          <Field
            label="Course name (optional)"
            value={title}
            onChangeText={setTitle}
            placeholder="Statistics 101"
            hint="If left blank, the uploaded file name becomes the course name."
            maxLength={120}
            editable={!busy && liveSession}
          />
          <Field
            label="Syllabus text"
            value={text}
            onChangeText={setText}
            tall
            editable={!busy && liveSession}
            placeholder="Week 1 — Describing data…"
            hint="Paste text instead of uploading a file, or review text extracted from an uploaded document."
          />

          {phase !== 'idle' ? (
            <>
              <Meter percent={PHASE_COPY[phase].percent} />
              <LText variant="small" accessibilityLiveRegion="polite">
                {PHASE_COPY[phase].label}
                {elapsedSeconds > 0 ? ` (${elapsedSeconds} seconds so far)` : ''}
              </LText>
              <LText variant="small" tone="muted">
                A long syllabus can take two or three minutes. Leave this screen open.
              </LText>
            </>
          ) : null}

          {failure ? (
            <Notice tone="error" title="Nothing was saved">
              <View style={styles.noticeActions}>
                <LText variant="small">
                  {failure} No course was created, so you can fix the problem above and press the
                  button again.
                </LText>
              </View>
            </Notice>
          ) : null}

          {publishFailure ? (
            <Notice tone="error" title="The course was created, but students cannot see it yet">
              <View style={styles.noticeActions}>
                <LText variant="small">
                  {publishFailure} The course and its tree are saved under Courses — do not import
                  the syllabus again, or you will end up with two copies. Publish it here, or later
                  from the chart toolbar.
                </LText>
                <View style={styles.rowWrap}>
                  <LButton
                    label={busy ? 'Publishing…' : 'Publish it now'}
                    icon="upload-cloud"
                    variant="primary"
                    disabled={busy}
                    onPress={retryPublish}
                  />
                  <LButton
                    label="Open the course anyway"
                    disabled={busy}
                    onPress={() => {
                      const courseId = unpublishedCourseId;
                      setUnpublishedCourseId(null);
                      if (courseId) onDrawn(courseId);
                    }}
                  />
                </View>
              </View>
            </Notice>
          ) : null}

          {unpublishedCourseId ? null : (
            <View style={styles.rowWrap}>
              <LButton
                label={busy
                  ? 'Working…'
                  : verification.data
                    ? 'Generate and publish course'
                    : 'Generate course tree'}
                variant="primary"
                icon="git-branch"
                disabled={!ready}
                onPress={submit}
              />
              <LText variant="small" tone="muted">
                {verification.data
                  ? 'The tree is generated and the course is published to the official catalog, where every signed-in student can find and join it.'
                  : verification.data === false
                    ? 'The course is created privately. Publishing it to students needs a verified instructor account.'
                    : 'Checking whether this account can publish to the official catalog.'}
              </LText>
            </View>
          )}
        </View>
      </Panel>
    </>
  );
}

// ------------------------------------------------------------------ settings

