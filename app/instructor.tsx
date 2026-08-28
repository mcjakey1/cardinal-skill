import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SkillTree } from '@/features/skilltree/SkillTree';
import { NodeEditorPanel } from '@/features/skilltree/NodeEditorPanel';
import { linkRefusal, mintId, missionsEqual, type NodeEdit } from '@/features/skilltree/nodeEditing';
import { MIN_COHORT, STALE_DAYS, activityFlag } from '@/features/skilltree/cohort';
import { DEMO_COURSE_ID, DEMO_COURSE_TITLE } from '@/features/skilltree/demoTree';
import { resolveName } from '@/features/skilltree/naming';
import { fetchTree } from '@/features/skilltree/queries';
import { validateGraph } from '@/features/skilltree/validation';
import {
  importedCourseTitle,
  instructorImportError,
  syllabusFileAccepted,
} from '@/features/skilltree/instructorCourseImport';
import { countChanges, diffCharts } from '@/features/skilltree/chartDiff';
import {
  fetchInstructorVerification,
  publishOfficialCourse,
} from '@/features/skilltree/courseCatalog';
import type { CourseKind, CoursePublicationStatus } from '@/features/skilltree/courseDistribution';
import { hasDestructiveChanges, summariseImpact, type ArchiveImpact } from '@/features/skilltree/chartImpact';
import { fetchArchiveImpact, publishChart } from '@/features/skilltree/publishChart';
import { purgeCourseCache } from '@/lib/editedTree';
import type { SkillNode } from '@/features/skilltree/types';
import type { ChartState } from '@/features/skilltree/chartDraft';
import { aliveSubgraph, sameNodeIds } from '@/features/skilltree/chartDraft';
import { unmoved, useChartDraft } from '@/lib/useChartDraft';
import { usePrefs } from '@/lib/prefs';
import { useAuth } from '@/auth/AuthContext';
import { usePixelTransition } from '@/ui/PixelTransition';
import { supabase } from '@/lib/supabase';
import { bytesToBase64 } from '@/lib/base64';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { extractTextFromPDF } from '@/lib/pdfTextExtraction';
import { lms } from '@/theme/lms';
import { AdminArea } from '@/ui/AdminArea';
import { DitherField } from '@/ui/Dither';
import { LmsFileDropzone, type LmsFileSelection } from '@/ui/LmsFileDropzone';
import {
  Badge,
  DataTable,
  Field,
  Icon,
  LButton,
  LModal,
  LText,
  Meter,
  Notice,
  Panel,
  PanelHead,
  Segmented,
  Skeleton,
  type Column,
  type IconName,
  type TableRow,
} from '@/ui/lms';

/**
 * The instructor workspace.
 *
 * This screen is a different design from the rest of the app, on purpose, and
 * `DESIGN.md` is its brief: a conventional LMS workspace, played
 * straight, for someone who already spends their week in Canvas and should not
 * have to learn a second interface to publish a syllabus. Rail, topbar,
 * breadcrumb, tables. Nothing here borrows the sixteen-colour grammar —
 *
 * — except the one place that has to. The authoring canvas draws the course in
 * the student's own tokens, at the student's geometry, because an instructor
 * looking at a tree needs to see the artifact as it is delivered. Restyling it
 * toward this surface would make it unable to answer the only question it is
 * there for.
 *
 * Protected writes require a real Supabase session. The local demo remains a
 * read-only example workspace and names that boundary at the action itself.
 */

type Section = 'courses' | 'tree' | 'students' | 'insights' | 'import' | 'settings' | 'admin';

const NAV: { key: Section; label: string; icon: IconName }[] = [
  { key: 'courses', label: 'Courses', icon: 'book-open' },
  { key: 'tree', label: 'Skill tree', icon: 'git-branch' },
  { key: 'students', label: 'Students', icon: 'users' },
  { key: 'insights', label: 'Class insights', icon: 'bar-chart-2' },
  { key: 'import', label: 'Import syllabus', icon: 'upload' },
];

const SECTION_LABEL: Record<Section, string> = {
  courses: 'Courses',
  tree: 'Skill tree',
  students: 'Students',
  insights: 'Class insights',
  import: 'Import syllabus',
  settings: 'Settings',
  admin: 'Admin',
};

interface CourseRow {
  id: string;
  title: string;
  term: string | null;
  /** True only for the signed-in owner. Publishing is owner-gated in RLS too. */
  canEdit: boolean;
  kind: CourseKind;
  publicationStatus: CoursePublicationStatus;
}

// --------------------------------------------------------------- cohort query

interface NodeCompletion {
  nodeId: string;
  title: string;
  completedCount: number;
}

type CohortReadout =
  | { kind: 'no-session' }
  | { kind: 'suppressed' }
  | {
      kind: 'ready';
      courseTitle: string;
      students: number;
      missionsCompleted: number;
      avgPerStudent: number;
      nodes: NodeCompletion[];
    };

async function fetchCohortReadout(courseId: string): Promise<CohortReadout> {
  // Both RPCs are security-definer functions keyed on auth.uid(), which cannot
  // tell "nobody signed in" from "not this course's owner" from "too few
  // students" apart — all three come back as zero rows. Asking first keeps
  // "suppressed" honest for the one case it actually names.
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { kind: 'no-session' };

  const [cohortRes, missionRes, courseRes, nodesRes] = await Promise.all([
    supabase.rpc('course_cohort_summary', { p_course_id: courseId }),
    supabase.rpc('course_mission_summary', { p_course_id: courseId }),
    supabase.from('courses').select('title').eq('id', courseId).maybeSingle(),
    supabase.from('skill_nodes').select('id, title, quest_title, title_override').eq('course_id', courseId),
  ]);

  // These two carry the actual figures, so their errors are not tolerated —
  // an instructor sees the real failure rather than a quietly empty screen.
  if (cohortRes.error) throw cohortRes.error;
  if (missionRes.error) throw missionRes.error;

  const row = cohortRes.data?.[0];
  if (!row) return { kind: 'suppressed' };

  // Per-mission rows rolled up to per-node, matching what the screen asks for.
  // A mission missing here is not an error: its own count can be below five
  // even while the class as a whole clears the floor.
  //
  // Names go through the same precedence every other screen uses — override,
  // then generated, then syllabus — via `resolveName` rather than the raw
  // `title` column, or this would be the one screen showing a syllabus title
  // where the rest of the app shows the quest name.
  const titleByNode = new Map<string, string>(
    (nodesRes.data ?? []).map((n) => [
      n.id,
      resolveName({ override: n.title_override, generated: n.quest_title, syllabus: n.title }).text,
    ]),
  );
  const totals = new Map<string, number>();
  for (const m of missionRes.data ?? []) {
    totals.set(m.node_id, (totals.get(m.node_id) ?? 0) + m.completed_count);
  }
  const nodes = [...totals.entries()]
    .map(([nodeId, completedCount]) => ({
      nodeId,
      title: titleByNode.get(nodeId) ?? nodeId,
      completedCount,
    }))
    .sort((a, b) => b.completedCount - a.completedCount);

  return {
    kind: 'ready',
    // Same fallback fetchTree uses: a course row RLS hides is still a cohort
    // worth reading, just not one with a name to print.
    courseTitle: courseRes.data?.title ?? 'Untitled course',
    students: row.students,
    missionsCompleted: row.missions_completed,
    avgPerStudent: Number(row.avg_missions_per_student ?? 0),
    nodes,
  };
}

// --------------------------------------------------------------- roster query

export interface RosterRow {
  userId: string;
  displayName: string;
  mastered: number;
  gradedNodes: number;
  progress: number;
  xp: number;
  lastActive: string | null;
}

type Roster = { kind: 'no-session' } | { kind: 'ready'; rows: RosterRow[] };

/**
 * Every student on one course, by name.
 *
 * `course_student_progress` (0005_instructor_reads.sql) is a security-definer
 * function gated on course ownership, so calling it for a course you do not own
 * returns nothing rather than an error — the same shape as calling it while
 * signed out. Asking `getUser()` first is what keeps those two apart on screen,
 * exactly as the cohort readout does.
 */
async function fetchRoster(courseId: string): Promise<Roster> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { kind: 'no-session' };

  const { data, error } = await supabase.rpc('course_student_progress', {
    p_course_id: courseId,
  });
  if (error) throw error;

  return {
    kind: 'ready',
    rows: (data ?? []).map((r: Record<string, unknown>) => ({
      userId: String(r.user_id),
      displayName: String(r.display_name),
      mastered: Number(r.mastered ?? 0),
      gradedNodes: Number(r.graded_nodes ?? 0),
      progress: Number(r.progress ?? 0),
      xp: Number(r.xp ?? 0),
      lastActive: r.last_active ? String(r.last_active) : null,
    })),
  };
}

/**
 * Invented students, labelled as invented wherever they appear.
 *
 * The same rule the sample cohort follows: chosen to exercise the screen rather
 * than flatter it. One has cleared nothing, one has been idle past the stale
 * threshold, and one is finished — so both flags and their absence are visible
 * without a database.
 */
const SAMPLE_ROSTER: RosterRow[] = [
  { userId: 's1', displayName: 'A. Reyes', mastered: 0, gradedNodes: 8, progress: 0, xp: 0, lastActive: null },
  { userId: 's2', displayName: 'B. Okafor', mastered: 1, gradedNodes: 8, progress: 13, xp: 50, lastActive: '2026-01-04T09:00:00.000Z' },
  { userId: 's3', displayName: 'C. Lindqvist', mastered: 3, gradedNodes: 8, progress: 38, xp: 140, lastActive: '2026-02-26T16:20:00.000Z' },
  { userId: 's4', displayName: 'D. Mwangi', mastered: 5, gradedNodes: 8, progress: 63, xp: 260, lastActive: '2026-02-28T11:05:00.000Z' },
  { userId: 's5', displayName: 'E. Fontaine', mastered: 6, gradedNodes: 8, progress: 75, xp: 320, lastActive: '2026-03-01T08:40:00.000Z' },
  { userId: 's6', displayName: 'F. Halvorsen', mastered: 8, gradedNodes: 8, progress: 100, xp: 480, lastActive: '2026-02-27T19:15:00.000Z' },
];

/**
 * Invented figures, labelled as invented wherever they appear.
 *
 * Chosen to show the rule rather than just fill the layout: a sixth node in this
 * imaginary course has three completions and is deliberately absent from the
 * list, because three is under the five-student floor. That omission is the most
 * important thing this screen does, and it would be invisible in sample data
 * where every row happened to clear the threshold.
 */
const SAMPLE_READOUT: Extract<CohortReadout, { kind: 'ready' }> = {
  kind: 'ready',
  courseTitle: 'Statistics 101 — sample data',
  students: 24,
  missionsCompleted: 187,
  avgPerStudent: 7.8,
  nodes: [
    { nodeId: 'sample-1', title: 'Describing data', completedCount: 22 },
    { nodeId: 'sample-2', title: 'Probability basics', completedCount: 19 },
    { nodeId: 'sample-3', title: 'Sampling distributions', completedCount: 14 },
    { nodeId: 'sample-4', title: 'Confidence intervals', completedCount: 9 },
    { nodeId: 'sample-5', title: 'Hypothesis testing', completedCount: 6 },
  ],
};

// -------------------------------------------------------------------- the app

export default function Instructor() {
  const router = useRouter();
  const { logout, session } = useAuth();
  const { transition } = usePixelTransition();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { lastCourseId, lowBandwidth, motionOff, set } = usePrefs();

  const wide = width >= lms.wide;
  const [section, setSection] = useState<Section>('courses');
  const [drawer, setDrawer] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const liveSession = session?.source === 'supabase';

  const courses = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: async (): Promise<CourseRow[]> => {
      const [{ data: auth }, current] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('courses')
          .select('id, title, term, owner_id, course_kind, publication_status')
          .order('created_at', { ascending: false }),
      ]);
      const result = current.error?.code === '42703' || current.error?.code === 'PGRST204'
        ? await supabase
            .from('courses')
            .select('id, title, term, owner_id')
            .order('created_at', { ascending: false })
        : current;
      const { data, error } = result;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const distribution = row as typeof row & {
          course_kind?: CourseKind;
          publication_status?: CoursePublicationStatus;
        };
        return {
          id: row.id,
          title: row.title,
          term: row.term,
          canEdit: Boolean(auth.user?.id) && row.owner_id === auth.user?.id,
          kind: distribution.course_kind ?? 'practice',
          publicationStatus: distribution.publication_status ?? 'draft',
        };
      });
    },
  });

  // The example chart is always in the list. Without a Supabase project behind
  // the app this is the only course there is, and a courses screen that reads
  // empty on a laptop is a workspace nobody can look at.
  const rows: CourseRow[] = [
    ...(courses.data ?? []),
    {
      id: DEMO_COURSE_ID,
      title: DEMO_COURSE_TITLE,
      term: 'Example chart',
      canEdit: false,
      kind: 'practice',
      publicationStatus: 'draft',
    },
  ];
  const courseId = chosen ?? lastCourseId ?? DEMO_COURSE_ID;
  const course = rows.find((r) => r.id === courseId) ?? rows[rows.length - 1]!;

  const go = (next: Section) => {
    setSection(next);
    setDrawer(false);
  };

  const open = (id: string) => {
    setChosen(id);
    // The same preference the student app keys off, so the chart the instructor
    // opened here is the chart CHART goes to on the nav bar.
    set('lastCourseId', id);
    go('tree');
  };

  const signOut = () => {
    transition(() => {
      set('role', null);
      void logout();
    });
  };

  const rail = (
    <Rail
      section={section}
      onGo={go}
      onClose={() => setDrawer(false)}
      closable={!wide}
      onSignOut={signOut}
    />
  );

  return (
    <View style={[styles.shell, { paddingTop: insets.top }]}>
      <Head>
        <title>Instructor workspace · Cardinal Skill</title>
        {/* Says "class-level" rather than naming a capability this must never
            have. The privacy boundary is the product, not a caveat on it. */}
        <meta
          name="description"
          content="Author a course tree, import a syllabus, and read class-level progress suppressed below five students."
        />
      </Head>

      {wide ? rail : null}

      <View style={styles.main}>
        <View style={styles.topbar}>
          {wide ? null : (
            <LButton
              label="Open navigation"
              icon="menu"
              hideLabel
              variant="quiet"
              onPress={() => setDrawer(true)}
            />
          )}

          <View style={styles.crumbs}>
            {wide ? (
              <>
                <Pressable onPress={() => go('courses')} accessibilityRole="link">
                  <LText variant="small" tone="muted">
                    Courses
                  </LText>
                </Pressable>
                <Icon name="chevron-right" size={14} />
                <Pressable onPress={() => go('tree')} accessibilityRole="link">
                  <LText variant="small" tone="muted" numberOfLines={1}>
                    {course.title}
                  </LText>
                </Pressable>
                <Icon name="chevron-right" size={14} />
              </>
            ) : null}
            <LText variant="small" style={styles.strong} numberOfLines={1}>
              {SECTION_LABEL[section]}
            </LText>
          </View>

          <Badge label={course.term ?? 'No term'} />
        </View>

        {/* The tree runs flush and owns its own scrolling: the canvas is a map,
            and a map inside a scroll view is a map you cannot pan. */}
        {section === 'tree' ? (
          <TreeSection
            course={course}
            canEdit={course.canEdit}
            wide={wide}
            flat={lowBandwidth}
            motionOff={motionOff}
            onImport={() => go('import')}
            onStudentView={() =>
              router.navigate({ pathname: '/tree/[courseId]', params: { courseId: course.id } })
            }
          />
        ) : (
          <ScrollView contentContainerStyle={[styles.page, wide ? styles.pageWide : null]}>
            {section === 'courses' && (
              <Courses
                rows={rows}
                activeId={course.id}
                loading={courses.isPending}
                error={courses.error}
                onOpen={open}
                onImport={() => go('import')}
                liveSession={liveSession}
                onSignIn={signOut}
              />
            )}
            {section === 'students' && <Students course={course} />}
            {section === 'insights' && <Insights course={course} />}
            {section === 'import' && (
              <ImportSyllabus
                liveSession={liveSession}
                onDrawn={open}
                onSignIn={signOut}
              />
            )}
            {section === 'settings' && (
              <Settings
                liveSession={liveSession}
                onSignOut={signOut}
              />
            )}
            {section === 'admin' && <AdminArea liveSession={liveSession} />}
          </ScrollView>
        )}
      </View>

      {!wide && drawer ? (
        <>
          <Pressable
            style={styles.scrim}
            onPress={() => setDrawer(false)}
            accessibilityRole="button"
            accessibilityLabel="Close navigation"
          />
          {/* Absolute children sit inside the shell's padding box, so the status
              bar inset is already accounted for and must not be added twice. */}
          <View style={styles.drawer}>{rail}</View>
        </>
      ) : null}
    </View>
  );
}

// ----------------------------------------------------------------------- rail

function Rail({
  section,
  onGo,
  onClose,
  closable,
  onSignOut,
}: {
  section: Section;
  onGo: (next: Section) => void;
  onClose: () => void;
  closable: boolean;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.rail} accessibilityLabel="Workspace navigation">
      <View style={styles.railBrand}>
        <View style={styles.mark}>
          <LText variant="section" tone="onBrand">
            C
          </LText>
        </View>
        <View style={styles.railBrandText}>
          <LText variant="small" style={styles.strong} numberOfLines={1}>
            Cardinal Skill
          </LText>
          <LText variant="small" tone="muted" numberOfLines={1}>
            Instructor workspace
          </LText>
        </View>
        {closable ? (
          <LButton label="Close navigation" icon="x" hideLabel variant="quiet" onPress={onClose} />
        ) : null}
      </View>

      <View style={styles.railNav}>
        {NAV.map((item) => (
          <RailCell
            key={item.key}
            label={item.label}
            icon={item.icon}
            active={section === item.key}
            onPress={() => onGo(item.key)}
          />
        ))}
      </View>

      <View style={styles.railFoot}>
        {/* Sits by Settings rather than in NAV: it is not a teaching task, and
            the page behind it is closed until a password opens it. */}
        <RailCell
          label="Admin"
          icon="shield"
          active={section === 'admin'}
          onPress={() => onGo('admin')}
        />
        <RailCell
          label="Settings"
          icon="settings"
          active={section === 'settings'}
          onPress={() => onGo('settings')}
        />
        <View style={styles.railUser}>
          <View style={styles.avatar}>
            <LText variant="small" tone="muted">
              IN
            </LText>
          </View>
          <View style={styles.railBrandText}>
            <LText variant="small" style={styles.strong} numberOfLines={1}>
              Signed in locally
            </LText>
            <LText variant="small" tone="muted" numberOfLines={1}>
              Instructor
            </LText>
          </View>
          <LButton label="Sign out" icon="log-out" hideLabel variant="quiet" onPress={onSignOut} />
        </View>
      </View>
    </View>
  );
}

function RailCell({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: IconName;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.railCell,
        active ? styles.railCellActive : null,
        !active && hovered ? { backgroundColor: lms.colour.surfaceHover } : null,
      ]}
    >
      <Icon name={icon} size={16} tone={active ? 'brand' : 'muted'} />
      <LText variant="small" tone={active ? 'brand' : 'ink'} style={active ? styles.strong : undefined}>
        {label}
      </LText>
    </Pressable>
  );
}

// -------------------------------------------------------------------- courses

const COURSE_COLUMNS: Column[] = [
  { key: 'course', label: 'Course', flex: 3 },
  { key: 'term', label: 'Term', flex: 1.5 },
  { key: 'go', label: '', flex: 0.4, num: true },
];

function Courses({
  rows,
  activeId,
  loading,
  error,
  onOpen,
  onImport,
  liveSession,
  onSignIn,
}: {
  rows: CourseRow[];
  activeId: string;
  loading: boolean;
  error: unknown;
  onOpen: (id: string) => void;
  onImport: () => void;
  liveSession: boolean;
  onSignIn: () => void;
}) {
  const queryClient = useQueryClient();
  const [blankOpen, setBlankOpen] = useState(false);
  const [blankTitle, setBlankTitle] = useState('');
  const [blankCode, setBlankCode] = useState('');
  const [blankBusy, setBlankBusy] = useState(false);
  const [blankError, setBlankError] = useState<string | null>(null);

  const openBlank = () => {
    setBlankError(null);
    setBlankOpen(true);
  };

  const createBlank = async () => {
    setBlankBusy(true);
    setBlankError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Your session expired. Sign in again to create a course.');
      const { data: course, error: createError } = await supabase
        .from('courses')
        .insert({
          title: blankTitle.trim(),
          course_code: blankCode.trim() || null,
          owner_id: auth.user.id,
        })
        .select('id')
        .single();
      if (createError || !course) {
        throw createError ?? new Error('The blank course was not created.');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['instructor-courses'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
      ]);
      setBlankOpen(false);
      setBlankTitle('');
      setBlankCode('');
      onOpen(course.id);
    } catch (cause) {
      setBlankError(instructorImportError(cause));
    } finally {
      setBlankBusy(false);
    }
  };

  const tableRows: TableRow[] = loading
    ? [0, 1, 2].map((i) => ({
        key: `skeleton-${i}`,
        cells: [<Skeleton key="a" width="60%" />, <Skeleton key="b" width="40%" />, null],
      }))
    : rows.map((c) => ({
        key: c.id,
        active: c.id === activeId,
        label: `${c.title}, open the skill tree`,
        onPress: () => onOpen(c.id),
        cells: [
          <View key="title" style={styles.rowStack}>
            <LText variant="small" style={styles.strong} numberOfLines={1}>
              {c.title}
            </LText>
            <LText variant="small" tone="muted">
              Open the skill tree
            </LText>
          </View>,
          c.term ?? '—',
          <Icon key="go" name="chevron-right" size={16} />,
        ],
      }));

  return (
    <>
      <PageHead
        title="Courses"
        lede="Create a course from a syllabus, or start with an empty skill tree and build it yourself."
        action={(
          <View style={styles.rowWrap}>
            <LButton label="Create blank course" icon="plus" onPress={openBlank} />
            <LButton label="Import syllabus" icon="upload" variant="primary" onPress={onImport} />
          </View>
        )}
      />

      {!liveSession ? (
        <Notice tone="attention" title="Sign in to create and save courses">
          <View style={styles.noticeActions}>
            <LText variant="small">
              The local instructor demo is read-only. Use a Supabase instructor account to upload
              syllabi, create course trees, and publish them to students.
            </LText>
            <LButton label="Go to sign in" icon="log-in" size="sm" onPress={onSignIn} />
          </View>
        </Notice>
      ) : null}

      {error ? (
        <Notice tone="error" title="Your courses did not load">
          The example chart below is a fixture in the repository and is unaffected. Everything else
          on this list needs a Supabase project and a signed-in account.
        </Notice>
      ) : null}

      <Panel>
        <DataTable
          caption={loading ? 'Reading courses' : `${rows.length} courses`}
          columns={COURSE_COLUMNS}
          rows={tableRows}
        />
      </Panel>

      <LModal visible={blankOpen} title="Create a blank course" onRequestClose={() => setBlankOpen(false)}>
        {liveSession ? (
          <>
            <LText variant="small" tone="muted">
              Start with an empty chart, then add topics, prerequisites, missions, and XP in the skill-tree editor.
              An empty course stays private to you: publish it to the official catalog from the chart toolbar once it has content.
            </LText>
            <Field
              label="Course name"
              value={blankTitle}
              onChangeText={setBlankTitle}
              placeholder="Statistics 101"
              maxLength={120}
              autoFocus
            />
            <Field
              label="Course code (optional)"
              value={blankCode}
              onChangeText={setBlankCode}
              placeholder="STAT 101"
              maxLength={32}
            />
            {blankError ? <Notice tone="error" title="Course not created">{blankError}</Notice> : null}
            <View style={styles.rowWrap}>
              <LButton
                label={blankBusy ? 'Creating…' : 'Create course'}
                variant="primary"
                disabled={blankBusy || !blankTitle.trim()}
                onPress={createBlank}
              />
              <LButton label="Cancel" variant="quiet" disabled={blankBusy} onPress={() => setBlankOpen(false)} />
            </View>
          </>
        ) : (
          <>
            <Notice tone="attention" title="A live account is required">
              The local demo cannot own or save a course. Sign in with your Supabase instructor account, then create the blank course.
            </Notice>
            <View style={styles.rowWrap}>
              <LButton label="Go to sign in" icon="log-in" variant="primary" onPress={onSignIn} />
              <LButton label="Cancel" variant="quiet" onPress={() => setBlankOpen(false)} />
            </View>
          </>
        )}
      </LModal>
    </>
  );
}

// ---------------------------------------------------------------------- tree

function TreeSection({
  course,
  canEdit,
  wide,
  flat,
  motionOff,
  onImport,
  onStudentView,
}: {
  course: CourseRow;
  canEdit: boolean;
  wide: boolean;
  flat: boolean;
  motionOff: boolean;
  onImport: () => void;
  onStudentView: () => void;
}) {
  const [selected, setSelected] = useState<SkillNode | null>(null);
  // Which node's form is open, rather than a bare flag: a different node means a
  // fresh form, and adding a node can open its form in the same turn it selects
  // it without an effect racing to close it again.
  const [editingId, setEditingId] = useState<string | null>(null);

  // `modalCard` has no maxHeight and the backdrop centres it, so a card taller
  // than the viewport hangs off both ends with nothing to scroll. On a landscape
  // phone that puts Save out of reach — the exact failure the sheet exists to
  // avoid. Bound it here rather than in `lms.tsx`, which is not ours to change.
  const { height } = useWindowDimensions();
  const modalScroll = useMemo(() => ({ maxHeight: Math.round(height * 0.7) }), [height]);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['instructor-tree', course.id],
    queryFn: () => fetchTree(course.id),
  });

  const queryClient = useQueryClient();
  const verification = useQuery({
    queryKey: ['instructor-verification'],
    queryFn: fetchInstructorVerification,
    enabled: canEdit && course.id !== DEMO_COURSE_ID,
  });
  const { draft, ready, edit, undoEdit, redoEdit, reset, reseed, markPublished, canUndo, canRedo } =
    useChartDraft(canEdit ? course.id : undefined);

  // Seed once per course, and only from a fresh read. A draft already holding
  // edits must survive a refetch, or a background refresh silently discards
  // work in progress.
  //
  // State rather than a ref because the toolbar gates on it: a draft that loads
  // from storage with ops already on it seeds without changing any other state,
  // and a ref would leave the tray hidden with nothing left to trigger a
  // re-render.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!canEdit || !data || !ready) return;
    if (seededFor === course.id) return;
    setSeededFor(course.id);
    // Unconditional, because `reseed` carries `published` across. Gating this on
    // `!draft.published` to save the undo baseline pinned the draft to a
    // baseline it could never leave: `published` is persisted and nothing else
    // clears it, so after one publish every later server-side change — another
    // instructor, a re-parse, a student's help subtree — came back as this
    // instructor's own unpublished edits, and server missions missing from the
    // pinned draft landed in `deleteMissions`.
    if (draft.ops.length === 0) {
      reseed({ nodes: data.tree.nodes, prereqs: data.tree.prereqs, missions: data.missions });
    }
  }, [canEdit, course.id, data, draft.ops.length, ready, reseed, seededFor]);

  /**
   * Whether the draft on screen is this course's, loaded and seeded.
   *
   * `useChartDraft` starts at an empty draft while `data` arrives instantly from
   * the react-query cache, so without this the toolbar flashes "N unpublished"
   * on every remount — N counting every mission and edge, because the diff is
   * against an empty chart — with Publish live and a confirm dialog offering to
   * delete every mission. `movedUnderneath` refuses the write, but it must
   * never be offered.
   */
  const draftReady = canEdit && ready && seededFor === course.id;

  const [editMode, setEditMode] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  // `selected` is a snapshot from the moment of the click, so everything below
  // re-derives the node instead of reading it.
  //
  // In edit mode that means the draft first: it is what the canvas draws, so
  // reading the server row here would show pre-edit values for a node that has
  // already been changed, record the wrong `before` on a second edit to the
  // same node, and leave a just-added node with no inspector at all. Outside
  // edit mode the server row is the truth, and it stays the fallback for a node
  // the draft has not got.
  const live =
    (editMode && canEdit ? draft.working.nodes.find((n) => n.id === selected?.id) : undefined)
    ?? data?.tree.nodes.find((n) => n.id === selected?.id)
    ?? null;

  // A different node means a fresh form, never the previous node's half-typed one.
  const editing = editingId !== null && editingId === selected?.id;

  // In edit mode the canvas draws the draft, so an unpublished change shows
  // where it was made. Archived nodes are already gone as far as a student goes.
  const shown = useMemo(() => aliveSubgraph(draft.working), [draft.working]);

  // The server returns retired nodes to the owner and hides them from students
  // by RLS, so the read-only canvas has to filter them the same way edit mode
  // does. Without this the owner is the one person shown a chart that is not
  // the chart, which is the opposite of what this canvas is for.
  const liveShown = useMemo(() => (data ? aliveSubgraph(data.tree) : null), [data]);

  const notice = (text: string) => {
    setLinkNotice(text);
    setTimeout(() => setLinkNotice(null), 2400);
  };

  const addNode = (at: { x: number; y: number }) => {
    const node: SkillNode = {
      id: mintId(),
      courseId: course.id,
      trackId: null,
      title: 'New node',
      description: '',
      kind: 'topic',
      xpReward: 50,
      x: at.x,
      y: at.y,
      sortOrder: draft.working.nodes.length,
    };
    edit({ t: 'add', node });
    setSelected(node);
    // Opened for naming straight away, same as the student chart: a node called
    // "New node" is the one thing nobody meant to add.
    setEditingId(node.id);
  };

  const startLink = () => {
    if (!selected) {
      notice('Select a source node first');
      return;
    }
    setLinkSourceId(selected.id);
    setLinkMode(true);
  };

  const cancelLink = () => {
    setLinkMode(false);
    setLinkSourceId(null);
  };

  const selectNode = (node: SkillNode) => {
    if (!linkMode || !linkSourceId) {
      setSelected(node);
      return;
    }
    // Same basis as the publish gate, or the two disagree about which chart is
    // being checked and a link can pass here only to block Publish later.
    const alive = aliveSubgraph(draft.working);
    const refusal = linkRefusal(alive.nodes, alive.prereqs, linkSourceId, node.id);
    if (refusal) {
      // Link mode stays on, same as the student chart: the source is still the
      // one they picked, and the fix is usually a different target.
      notice(refusal);
      return;
    }
    edit({ t: 'link', nodeId: node.id, prereqId: linkSourceId });
    cancelLink();
  };

  const archiveSelected = () => {
    if (!selected) return;
    edit({ t: 'archive', nodeId: selected.id });
    setSelected(null);
  };

  const moveNode = (nodeId: string, at: { x: number; y: number }) => {
    const before = draft.working.nodes.find((n) => n.id === nodeId);
    if (!before) return;
    edit({ t: 'move', nodeId, before: { x: before.x, y: before.y }, after: at });
  };

  const liveState = useMemo(
    () => ({
      nodes: data?.tree.nodes ?? [],
      prereqs: data?.tree.prereqs ?? [],
      missions: data?.missions ?? [],
    }),
    [data],
  );
  // Against the baseline, never against `liveState`. The query has no staleTime
  // and refetches on window focus, while the seed effect deliberately does not
  // re-seed once this course is seeded — so with ops pending, tabbing away and
  // back moves `liveState` past `draft.baseline` while `working` still holds
  // seed-time values. Diffing against it would turn every field, mission and
  // edge a colleague changed in between into one of ours and revert it on
  // publish, as well as inflating the count with edits nobody here made.
  // `liveState` stays for `summariseImpact`, which only wants titles.
  const changes = useMemo(
    () => diffCharts(draft.baseline, draft.working),
    [draft.baseline, draft.working],
  );
  const validation = useMemo(() => {
    const alive = aliveSubgraph(draft.working);
    return validateGraph(alive.nodes, alive.prereqs);
  }, [draft.working]);

  const [confirming, setConfirming] = useState(false);
  const [impact, setImpact] = useState<ArchiveImpact[]>([]);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [catalogConfirming, setCatalogConfirming] = useState(false);
  const [catalogPublishing, setCatalogPublishing] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const doPublishOfficial = async () => {
    setCatalogPublishing(true);
    setCatalogError(null);
    try {
      await publishOfficialCourse(course.id);
      setCatalogConfirming(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['instructor-courses'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['course-catalog', 'official'] }),
      ]);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'The course was not published to the catalog.');
    } finally {
      setCatalogPublishing(false);
    }
  };

  const openConfirm = async () => {
    setPublishError(null);
    setImpact([]);
    // Open first. Waiting on the round trip before showing anything makes
    // Publish look dead; the counts fill into the dialog once they land.
    setConfirming(true);
    try {
      const rows = await fetchArchiveImpact(course.id, changes.archiveNodes);
      setImpact(summariseImpact(changes, liveState, rows));
    } catch (err) {
      // Leave `impact` empty rather than summarising against no rows: that
      // would print a confident "0 students cleared it" we cannot stand behind.
      setPublishError(
        `The impact counts could not be read${
          err instanceof Error ? `: ${err.message.replace(/\.$/, '')}` : ''
        }. Retiring still works, but this dialog cannot say what it costs.`,
      );
    }
  };

  const doPublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      // Re-read before writing. Another instructor, or a syllabus re-parse, may
      // have moved the chart since this draft started; publishing over that
      // silently would be last-write-wins on someone else's work.
      const fresh = await fetchTree(course.id);
      const freshState: ChartState = {
        nodes: fresh.tree.nodes,
        prereqs: fresh.tree.prereqs,
        missions: fresh.missions,
      };
      if (!sameNodeIds(freshState, draft.baseline)) {
        setPublishError('This chart changed since you started editing. Reload before publishing.');
        return;
      }

      const before = draft.baseline;
      await publishChart(course.id, changes);
      await purgeCourseCache(course.id);
      const after = await fetchTree(course.id);
      markPublished(before, {
        nodes: after.tree.nodes,
        prereqs: after.tree.prereqs,
        missions: after.missions,
      });
      setConfirming(false);
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['instructor-cohort', course.id] }),
        queryClient.invalidateQueries({ queryKey: ['instructor-roster', course.id] }),
        queryClient.invalidateQueries({ queryKey: ['instructor-courses'] }),
      ]);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'The publish did not go through.');
    } finally {
      setPublishing(false);
    }
  };

  /**
   * A publish is reversible because almost nothing it does is destructive:
   * archiving is a flag, node uuids are stable, and edges are re-insertable. The
   * inverse of a change set is the diff taken the other way round.
   *
   * Two honest limits. `diffCharts` only walks the target's nodes, so a node the
   * publish *added* is simply not mentioned by the inverse — it stays live and
   * unarchived rather than being retired, and the undo lands on the previous
   * chart plus that node. And missions are the one thing publish can genuinely
   * destroy, so an inverse that deletes any is refused below rather than run.
   */
  const undoPublish = async () => {
    if (!draft.published) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const current = await fetchTree(course.id);
      const before: ChartState = {
        nodes: current.tree.nodes,
        prereqs: current.tree.prereqs,
        missions: current.missions,
      };
      // The mount-time withdrawal cannot see a colleague who publishes while
      // this instructor stays on the section, and this button reverts the whole
      // chart rather than a targeted diff. Re-check against the read just taken,
      // on the same predicate, so the two cannot disagree. A draft with no
      // `publishedAt` cannot be verified at all, which is equally a refusal.
      if (!draft.publishedAt || !unmoved(draft.publishedAt, before)) {
        setPublishError(
          'This chart has changed since you published, so undoing it would revert someone else’s work too. Nothing has been undone. Reload to see where the chart stands.',
        );
        return;
      }

      const inverse = diffCharts(before, draft.published);
      // `mission_progress.mission_id` cascades, so this would take every
      // student's record of finishing them — and unlike the publish path there
      // is no confirm step in front of this button. Refuse and say why.
      if (inverse.deleteMissions.length > 0) {
        setPublishError(
          `Undoing this would delete ${inverse.deleteMissions.length} mission${
            inverse.deleteMissions.length === 1 ? '' : 's'
          } and every student's record of completing them. Undo cannot do that. Retire the node instead, which keeps the records.`,
        );
        return;
      }
      await publishChart(course.id, inverse);
      await purgeCourseCache(course.id);
      const after = await fetchTree(course.id);
      // One-shot on purpose. The chart is back where it was, so there is
      // nothing left to undo: `reset` re-seeds from the fresh read and clears
      // the baseline, so the button goes away instead of becoming a redo
      // wearing an Undo label.
      reset({ nodes: after.tree.nodes, prereqs: after.tree.prereqs, missions: after.missions });
      await refetch();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'The undo did not go through.');
    } finally {
      setPublishing(false);
    }
  };

  // Same graph `live` came from, or the editor would price a node against
  // missions the canvas is not drawing.
  const ownMissions = useMemo(
    () =>
      (editMode && canEdit ? draft.working.missions : data?.missions ?? []).filter(
        (m) => m.skillId === live?.id,
      ),
    [canEdit, data?.missions, draft.working.missions, editMode, live?.id],
  );

  // Same graph again, so an edge added in the draft is listed where it was made
  // rather than only drawn on the canvas.
  const ownPrereqs = useMemo(() => {
    const state = editMode && canEdit
      ? draft.working
      : { nodes: data?.tree.nodes ?? [], prereqs: data?.tree.prereqs ?? [] };
    return state.prereqs
      .filter((p) => p.nodeId === live?.id)
      .map((p) => ({
        id: p.prereqId,
        title: state.nodes.find((n) => n.id === p.prereqId)?.title ?? p.prereqId,
      }));
  }, [canEdit, data?.tree.nodes, data?.tree.prereqs, draft.working, editMode, live?.id]);

  /**
   * Editing is offered only from inside edit mode.
   *
   * `live` prefers the draft row only when `editMode` is on; outside it the
   * inspector reads the server row, because that is what the canvas is drawing.
   * Offering Edit there let a `field` op record a `before` the draft never held
   * — rename in edit mode, leave it, rename again, and undo restores a state
   * that never existed. Publishing is unaffected either way, since the diff is
   * state-based, but the undo stack is not.
   */
  const canEditNode = editMode && canEdit;

  /**
   * The shared editor's half of the persistence contract, instructor side.
   *
   * The same `NodeEdit` the student screen writes straight to the device lands
   * here as ops on the publish draft, so nothing reaches a student until
   * Publish. Two ops rather than one because they undo separately, and an
   * instructor who only renamed a node should not have their missions on the
   * same undo step.
   */
  const saveNodeEdit = (next: NodeEdit) => {
    if (!live) return;
    edit({
      t: 'field',
      nodeId: live.id,
      before: {
        titleOverride: live.titleOverride ?? null,
        description: live.description,
        kind: live.kind,
        xpReward: live.xpReward,
        iconKey: live.iconKey ?? null,
      },
      after: {
        titleOverride: next.titleOverride,
        description: next.description,
        kind: next.kind,
        iconKey: next.iconKey,
        // Omitted entirely when missions own it, so the change set never claims
        // an XP edit the publish will not make — it recomputes the sum (0015:252).
        ...(next.missions.length > 0 ? {} : { xpReward: next.xpReward }),
      },
    });
    if (!missionsEqual(ownMissions, next.missions)) {
      edit({ t: 'mission', nodeId: live.id, before: ownMissions, after: next.missions });
    }
    setEditingId(null);
  };

  const unlinkPrereq = (prereqId: string) => {
    if (!live) return;
    edit({ t: 'unlink', nodeId: live.id, prereqId });
  };

  const inspectorBody = editing && live && canEditNode ? (
    <NodeEditorPanel
      key={live.id}
      node={live}
      missions={ownMissions}
      prereqs={ownPrereqs}
      onUnlink={unlinkPrereq}
      reduceMotion={motionOff}
      // `publish_chart_changes` writes every node with `track_id` null
      // (0015:136), so an instructor cannot make one universal from here.
      canSetUniversal={false}
      onSave={saveNodeEdit}
      onCancel={() => setEditingId(null)}
    />
  ) : (
    <NodeInspector
      node={live}
      prereqCount={ownPrereqs.length}
      canEdit={canEditNode}
      onStartEdit={() => setEditingId(live?.id ?? null)}
    />
  );

  return (
    <>
      <View style={[styles.canvasLayout, wide ? styles.canvasLayoutWide : null]}>
      <View style={styles.canvasColumn}>
        <View style={styles.toolbar}>
          <LText variant="small" style={styles.strong} numberOfLines={1}>
            {data?.title ?? course.title}
          </LText>
          <View style={styles.spacer} />
          {/* `|| canRedo` because undoing the last op takes the count to zero,
              and without it the whole tray vanishes mid-gesture and strands the
              redo. The badge and Publish still track real changes. */}
          {draftReady && (countChanges(changes) > 0 || canRedo) ? (
            <>
              {countChanges(changes) > 0 ? (
                <Badge label={`${countChanges(changes)} unpublished`} tone="gold" />
              ) : null}
              <LButton label="Undo" icon="rotate-ccw" size="sm" disabled={!canUndo} onPress={undoEdit} />
              <LButton label="Redo" icon="rotate-cw" size="sm" disabled={!canRedo} onPress={redoEdit} />
              {countChanges(changes) > 0 ? (
                <LButton
                  label="Publish"
                  variant="primary"
                  size="sm"
                  disabled={!validation.isValid}
                  onPress={openConfirm}
                />
              ) : null}
            </>
          ) : null}
          {/* Only with nothing unpublished pending: an undo on top of a
              half-made new draft would publish both at once. */}
          {draftReady && draft.published && countChanges(changes) === 0 ? (
            <LButton
              label={publishing ? 'Undoing…' : 'Undo publish'}
              icon="rotate-ccw"
              size="sm"
              disabled={publishing}
              onPress={undoPublish}
            />
          ) : null}
          {canEdit && course.id !== DEMO_COURSE_ID ? (
            course.kind === 'official' && course.publicationStatus === 'published' ? (
              <Badge label="Official catalog" tone="ok" />
            ) : (
              <LButton
                label="Publish to official catalog"
                icon="globe"
                size="sm"
                disabled={verification.isPending}
                onPress={() => {
                  setCatalogError(null);
                  setCatalogConfirming(true);
                }}
              />
            )
          ) : null}
          {/* Edits the chart already on screen. It used to leave for a separate
              node-row form that created a second, unrelated course, which is
              the one thing "edit this course" must never do. */}
          {canEdit && !editMode ? (
            <LButton
              label="Edit by hand"
              icon="edit-3"
              size="sm"
              onPress={() => setEditMode(true)}
            />
          ) : null}
          <LButton
            label="Open as a student"
            icon="external-link"
            size="sm"
            onPress={onStudentView}
          />
        </View>

        {/* The confirm dialog owns this error while it is open. Undo publish
            runs straight from the toolbar with no dialog, so without this strip
            a failed undo looks like a button that did nothing. */}
        {publishError && !confirming ? (
          <View style={styles.canvasMessage}>
            <Notice tone="error" title="Not published">
              {publishError}
            </Notice>
            <View style={styles.rowWrap}>
              <LButton label="Dismiss" onPress={() => setPublishError(null)} />
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={styles.canvasMessage}>
            <Notice tone="error" title="That tree did not load">
              {error instanceof Error ? error.message : 'The chart could not be read.'}
            </Notice>
            <View style={styles.rowWrap}>
              <LButton label="Try again" onPress={() => refetch()} />
              <LButton label="Import a syllabus" variant="primary" onPress={onImport} />
            </View>
          </View>
        ) : isPending || !data ? (
          <View style={styles.canvasMessage}>
            <Skeleton width="45%" />
            <Skeleton width="70%" />
            <Skeleton width="30%" />
          </View>
        ) : (
          <View style={styles.canvasStage}>
            {/* The student's field, in the student's tokens. Restyling it toward
                this surface would stop it answering the only question it is
                here for: what does this look like when it is handed over. */}
            <DitherField variant="chart" flat={flat} />
          <SkillTree
            viewportKey={`instructor:${course.id}`}
              tree={editMode && canEdit ? shown : liveShown ?? data.tree}
              masteredIds={data.masteredIds}
              selectedId={selected?.id ?? null}
              onSelectNode={selectNode}
              reduceMotion={motionOff}
              lowBandwidth={flat}
              editMode={editMode}
              linkMode={linkMode}
              linkSourceId={linkSourceId}
              linkNotice={linkNotice}
              onToggleEditMode={
                canEdit
                  ? (next) => {
                      setEditMode(next);
                      if (!next) {
                        cancelLink();
                        // Leaving edit mode flips `live` back to the server row.
                        // An open form would keep editing against it and record
                        // a `before` the draft never held — the same corruption
                        // gating the button closes, arriving the other way.
                        setEditingId(null);
                      }
                    }
                  : undefined
              }
              onAddNode={canEdit ? addNode : undefined}
              onToggleLinkMode={canEdit ? startLink : undefined}
              onCancelLink={canEdit ? cancelLink : undefined}
              // "Archive, never delete" is the safety decision this feature rests
              // on; the tool that does it should not say the opposite.
              deleteLabel="RETIRE NODE"
              onDeleteNode={canEdit ? archiveSelected : undefined}
              // `useNodeLayout` is a device-local arrangement of someone else's
              // chart. An instructor's move is a real coordinate that publishes.
              positions={undefined}
              onMoveNode={canEdit ? moveNode : undefined}
            />
          </View>
        )}
      </View>

      {/* Below `lms.wide` the tree renders outside the page's ScrollView so the
          canvas can be panned. A form stacked under it would squeeze the canvas
          to its floor and then clip with no way to scroll to the bottom, so the
          same inspector arrives as a sheet over the chart instead. */}
      {wide ? (
        <View style={[styles.inspector, styles.inspectorWide]}>
          <ScrollView contentContainerStyle={styles.inspectorScroll}>{inspectorBody}</ScrollView>
        </View>
      ) : (
        <LModal
          visible={Boolean(live)}
          title={live?.title ?? 'Node'}
          onRequestClose={() => {
            setSelected(null);
            setEditingId(null);
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView style={modalScroll} contentContainerStyle={styles.inspectorScroll}>
              {inspectorBody}
            </ScrollView>
          </KeyboardAvoidingView>
        </LModal>
      )}
      </View>

      {/* Outside the section's layout on purpose. Anything absolutely positioned
          inside it renders below the nav drawer, a later sibling of `main`. */}
      <LModal visible={confirming} title="Publish changes" onRequestClose={() => setConfirming(false)}>
        {/* Only the reading scrolls; the actions stay pinned below it, so a long
            impact list can never push Publish off the bottom of the screen. */}
        <ScrollView style={modalScroll} contentContainerStyle={styles.dialogScroll}>
        <LText variant="small" tone="muted">
          {countChanges(changes)} change{countChanges(changes) === 1 ? '' : 's'} will reach students.
        </LText>

        {impact.length > 0 ? (
          <Notice tone="attention" title="Retiring work students have done">
            {impact.map((row) => (
              <LText key={row.nodeId} variant="small">
                {row.title} — {row.studentsCompleted} student
                {row.studentsCompleted === 1 ? '' : 's'} cleared it, {row.missionsHidden} mission
                {row.missionsHidden === 1 ? '' : 's'} hidden, {row.danglingEdges} connection
                {row.danglingEdges === 1 ? '' : 's'} dropped
                {row.helpDescendants > 0 ? `, ${row.helpDescendants} help step${row.helpDescendants === 1 ? '' : 's'} hidden with it` : ''}.
                Their XP stays banked and nothing is deleted, so this is reversible
                while it is unpublished, and by Undo publish straight afterwards.
              </LText>
            ))}
          </Notice>
        ) : null}

        {publishError ? <Notice tone="error" title="Not published">{publishError}</Notice> : null}

        {changes.deleteMissions.length > 0 ? (
          <Notice tone="error" title="Deleting missions cannot be undone">
            {changes.deleteMissions.length} mission
            {changes.deleteMissions.length === 1 ? '' : 's'} will be removed. Every student&rsquo;s record
            of completing them goes with it, and Undo publish cannot bring those records back.
            Retiring the whole node instead keeps them.
          </Notice>
        ) : null}
        </ScrollView>

        <View style={styles.rowWrap}>
          <LButton
            label={publishing ? 'Publishing…' : 'Publish'}
            variant={hasDestructiveChanges(changes) ? 'danger' : 'primary'}
            disabled={publishing}
            onPress={doPublish}
          />
          <LButton label="Cancel" variant="quiet" disabled={publishing} onPress={() => setConfirming(false)} />
        </View>
      </LModal>

      <LModal
        visible={catalogConfirming}
        title="Publish to the official catalog"
        onRequestClose={() => !catalogPublishing && setCatalogConfirming(false)}
      >
        {verification.data ? (
          <>
            <LText variant="small" tone="muted">
              Every signed-in student will be able to discover and join {course.title}. Its learner
              leaderboard stays separate from every other course, and you will not appear in it.
            </LText>
            <Notice tone="attention" title="Review the chart first">
              Catalog publication exposes the currently saved chart. Publish any pending chart edits before continuing.
            </Notice>
          </>
        ) : verification.isError ? (
          <Notice tone="error" title="Verification could not be checked">
            Check the database connection and try again. No course has been published.
          </Notice>
        ) : (
          <Notice tone="attention" title="This account cannot publish">
            An instructor account carries publishing rights from the day it registers, so an account
            without them either registered as a student or had them withdrawn. An administrator can
            restore them.
          </Notice>
        )}
        {catalogError ? <Notice tone="error" title="Not published">{catalogError}</Notice> : null}
        <View style={styles.rowWrap}>
          {verification.data ? (
            <LButton
              label={catalogPublishing ? 'Publishing…' : 'Publish official course'}
              variant="primary"
              disabled={catalogPublishing}
              onPress={doPublishOfficial}
            />
          ) : verification.isError ? (
            <LButton label="Retry verification" onPress={() => void verification.refetch()} />
          ) : null}
          <LButton
            label="Cancel"
            variant="quiet"
            disabled={catalogPublishing}
            onPress={() => setCatalogConfirming(false)}
          />
        </View>
      </LModal>
    </>
  );
}

// ------------------------------------------------------------------- students

const ROSTER_COLUMNS: Column[] = [
  { key: 'student', label: 'Student', flex: 3 },
  { key: 'cleared', label: 'Cleared', num: true, flex: 1.2 },
  { key: 'progress', label: 'Progress', flex: 2 },
  { key: 'xp', label: 'XP', num: true, flex: 1 },
  { key: 'seen', label: 'Last cleared', flex: 1.4 },
];

const FLAG_LABEL = {
  'not-started': 'Nothing cleared yet',
  stale: `Nothing in ${STALE_DAYS} days`,
} as const;

/**
 * The roster.
 *
 * This is a per-student read, and it is the one screen in the app where a name
 * sits next to a record — so what it shows is bounded on purpose. Progress
 * through work the instructor set, and when it last moved. No grades, because
 * Cardinal Skill does not hold any; no pace or effort estimate, because those
 * are inferences about a person rather than facts about their work.
 */
function Students({ course }: { course: CourseRow }) {
  const [sample, setSample] = useState(false);
  const [filter, setFilter] = useState<'all' | 'flagged'>('all');
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['instructor-roster', course.id],
    queryFn: () => fetchRoster(course.id),
  });

  // Read once per render rather than per row, so a list cannot flag one student
  // against a different clock than the one beside them.
  const now = new Date();
  const rows = sample ? SAMPLE_ROSTER : data?.kind === 'ready' ? data.rows : [];
  const flagged = rows.filter((r) => activityFlag(r, now) !== null);
  const shown = filter === 'flagged' ? flagged : rows;

  const toggle = (
    <LButton
      label={sample ? 'Hide the sample roster' : 'Show a sample roster'}
      icon={sample ? 'eye-off' : 'eye'}
      onPress={() => setSample((on) => !on)}
    />
  );

  return (
    <>
      <PageHead
        title="Students"
        lede={`Everyone enrolled on ${course.title}, least far along first. Progress is how much of the graded tree a student has cleared — Cardinal Skill stores no grades, so there are none here to show.`}
      />

      {sample ? (
        <Notice tone="attention" title="Sample roster — these people do not exist">
          Six invented students, so the screen can be looked at without a database. No row below was
          read from anywhere.
        </Notice>
      ) : null}

      {!sample && error ? (
        <>
          <Notice tone="error" title="The roster did not load">
            {error instanceof Error ? error.message : 'The roster could not be read.'}
          </Notice>
          <View style={styles.rowWrap}>
            <LButton label="Try again" onPress={() => refetch()} />
            {toggle}
          </View>
        </>
      ) : null}

      {!sample && !error && data?.kind === 'no-session' ? (
        <>
          <Notice tone="attention" title="Sign-in needed">
            A roster is only ever returned to the account that owns the course, and sign-in is not
            wired in this build. Nobody is invented to fill the table.
          </Notice>
          {toggle}
        </>
      ) : null}

      {!sample && isPending ? (
        <Panel>
          <View style={styles.panelBody}>
            <Skeleton width="45%" />
            <Skeleton width="60%" />
            <Skeleton width="52%" />
          </View>
        </Panel>
      ) : null}

      {rows.length > 0 ? (
        <>
          <Segmented
            label="Filter the roster"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `Everyone (${rows.length})` },
              { value: 'flagged', label: `Worth a look (${flagged.length})` },
            ]}
          />

          <Panel>
            <DataTable
              columns={ROSTER_COLUMNS}
              rows={shown.map((r) => {
                const flag = activityFlag(r, now);
                return {
                  key: r.userId,
                  label: `${r.displayName}, ${r.progress}% cleared`,
                  cells: [
                    <View key="student" style={styles.rowInline}>
                      <View style={styles.avatar}>
                        <LText variant="small" tone="muted">
                          {initials(r.displayName)}
                        </LText>
                      </View>
                      <View style={styles.rowStack}>
                        <LText variant="small" style={styles.strong} numberOfLines={1}>
                          {r.displayName}
                        </LText>
                        {flag ? <Badge label={FLAG_LABEL[flag]} tone="attention" /> : null}
                      </View>
                    </View>,
                    `${r.mastered}/${r.gradedNodes}`,
                    <Meter key="meter" percent={r.progress} />,
                    String(r.xp),
                    r.lastActive ? r.lastActive.slice(0, 10) : '—',
                  ],
                };
              })}
              empty={
                <LText variant="small" tone="muted">
                  Nobody matches this filter.
                </LText>
              }
            />
          </Panel>

          {sample ? toggle : null}
        </>
      ) : null}

      {!sample && !error && data?.kind === 'ready' && data.rows.length === 0 ? (
        <>
          <Notice title="Nobody is enrolled on this course yet">
            The roster fills as students join. Until then there is nothing to read, and nothing is
            put here to stand in for it.
          </Notice>
          {toggle}
        </>
      ) : null}
    </>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ------------------------------------------------------------------ insights

function Insights({ course }: { course: CourseRow }) {
  const [sample, setSample] = useState(false);
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['instructor-cohort', course.id],
    queryFn: () => fetchCohortReadout(course.id),
  });

  const readout = sample ? SAMPLE_READOUT : data;

  const toggle = (
    <LButton
      label={sample ? 'Hide the sample figures' : 'Show sample figures'}
      icon={sample ? 'eye-off' : 'eye'}
      onPress={() => setSample((on) => !on)}
    />
  );

  return (
    <>
      {/* This screen used to claim that nobody could be identified from it. With
          a roster one tab away that would now be a lie, so it says what the floor
          actually still does: it stops an average being computed over a group too
          small to be an average. */}
      <PageHead
        title="Class insights"
        lede={`Where ${course.title} is as a whole. Averages stay hidden below ${MIN_COHORT} students, because a figure over two people is not an average. For one student's own progress, open Students.`}
      />

      {sample ? (
        <Notice tone="attention" title="Sample figures — every number below is made up">
          No database was read, no class exists and nobody is signed in. This is the layout only.
        </Notice>
      ) : null}

      {!sample && isPending ? (
        <Panel>
          <View style={styles.panelBody}>
            <Skeleton width="55%" />
            <Skeleton width="35%" />
            <Skeleton width="45%" />
          </View>
        </Panel>
      ) : null}

      {!sample && error ? (
        <>
          <Notice tone="error" title="The class summary did not load">
            {error instanceof Error ? error.message : 'The summary could not be read.'}
          </Notice>
          <View style={styles.rowWrap}>
            <LButton label="Try again" onPress={() => refetch()} />
            {toggle}
          </View>
        </>
      ) : null}

      {!sample && !error && data?.kind === 'no-session' ? (
        <>
          <Notice tone="attention" title="Sign-in needed for real figures">
            Class figures come from two database functions gated on the signed-in account, and
            sign-in is not wired in this build. Nothing is invented to stand in for them.
          </Notice>
          {toggle}
        </>
      ) : null}

      {!sample && !error && data?.kind === 'suppressed' ? (
        <Notice tone="attention" title="Too few students to average">
          Fewer than {MIN_COHORT} students in this class have completed anything, so there is no
          meaningful class figure to draw yet. Their individual progress is on Students.
        </Notice>
      ) : null}

      {readout?.kind === 'ready' ? (
        <>
          <Panel>
            <PanelHead
              title="Cohort"
              right={<Badge label={`${readout.students} students`} />}
            />
            <View style={styles.panelBody}>
              <Figure label="Students" value={String(readout.students)} />
              <Figure label="Missions completed" value={String(readout.missionsCompleted)} />
              <Figure label="Per student" value={readout.avgPerStudent.toFixed(1)} />
            </View>
          </Panel>

          <LText variant="section" style={styles.sectionHeading}>
            Per skill
          </LText>

          <Panel>
            <DataTable
              columns={[
                { key: 'title', label: 'Skill', flex: 3 },
                { key: 'done', label: 'Completed', num: true, flex: 1 },
              ]}
              rows={readout.nodes.map((n) => ({
                key: n.nodeId,
                label: `${n.title}, ${n.completedCount} completed`,
                cells: [n.title, String(n.completedCount)],
              }))}
              empty={
                <LText variant="small" tone="muted">
                  No single skill has {MIN_COHORT} completions of its own yet, so none are listed.
                </LText>
              }
            />
          </Panel>

          {sample ? (
            <>
              <Notice title="What is missing here, and why">
                A sixth skill in this imaginary course has three completions and is deliberately not
                listed. Below {MIN_COHORT} students a count starts identifying people, so it is not
                returned at all — that omission is the rule working, not a gap in the table.
              </Notice>
              {toggle}
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

// -------------------------------------------------------------------- import

type SelectedSyllabusDocument = {
  name: string;
  mediaType: 'application/pdf';
  base64: string;
};

interface InstructorParseResult {
  course_id: string;
  node_count: number;
  mission_count: number;
  edge_count: number;
}

function ImportSyllabus({
  liveSession,
  onDrawn,
  onSignIn,
}: {
  liveSession: boolean;
  onDrawn: (courseId: string) => void;
  onSignIn: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [document, setDocument] = useState<SelectedSyllabusDocument | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState('No file selected');
  const [fileTone, setFileTone] = useState<'idle' | 'ok' | 'bad'>('idle');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [publishFailure, setPublishFailure] = useState<string | null>(null);

  // Read up front so the screen can say, before the instructor presses anything,
  // whether this import will reach students. The same key backs the chart
  // toolbar's publish dialog, so the answer is fetched once per session.
  const verification = useQuery({
    queryKey: ['instructor-verification'],
    queryFn: fetchInstructorVerification,
    enabled: liveSession,
  });

  const ready = liveSession && (text.trim().length > 0 || Boolean(document)) && !busy;

  const readFile = async (file: LmsFileSelection) => {
    setFailure(null);
    if (!syllabusFileAccepted(file.name)) {
      setDocument(null);
      setFileName(null);
      setFileStatus('Choose a PDF, TXT, or Markdown file.');
      setFileTone('bad');
      return;
    }

    setFileName(file.name);
    setFileStatus('Reading file…');
    setFileTone('idle');
    try {
      const response = await fetch(file.uri);
      if (!response.ok) throw new Error(`The file could not be read (HTTP ${response.status}).`);
      if (/\.pdf$/i.test(file.name) || file.mimeType === 'application/pdf') {
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (bytes.byteLength > 15_000_000) throw new Error('That PDF is larger than 15 MB.');
        setDocument({ name: file.name, mediaType: 'application/pdf', base64: bytesToBase64(bytes) });
        try {
          const extracted = await extractTextFromPDF(buffer);
          setText(extracted?.text ?? '');
        } catch {
          // Scanned and native PDFs remain usable through the server parser.
          setText('');
        }
        setFileStatus(`${Math.ceil(bytes.byteLength / 1024)} KB PDF ready to import`);
      } else {
        const body = await response.text();
        if (!body.trim()) throw new Error('That file does not contain any syllabus text.');
        setText(body);
        setDocument(null);
        setFileStatus(`${body.length.toLocaleString()} characters ready to import`);
      }
      setFileTone('ok');
    } catch (cause) {
      setDocument(null);
      setFileName(null);
      setFileStatus('The file could not be read. Paste the syllabus text instead.');
      setFileTone('bad');
      setFailure(instructorImportError(cause));
    }
  };

  const submit = async () => {
    if (!liveSession) return;
    setBusy(true);
    setFailure(null);
    setPublishFailure(null);
    let createdCourseId: string | null = null;
    let parsed = false;
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Your session expired. Sign in again to import a syllabus.');
      const provisionalTitle = importedCourseTitle(title, fileName);
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({ title: provisionalTitle, owner_id: auth.user.id })
        .select('id')
        .single();
      if (courseError || !course) throw courseError ?? new Error('No course was returned.');
      createdCourseId = course.id;

      const extractedText = text.trim();
      const result = await callEdgeFunction<InstructorParseResult>(
        'parse-syllabus',
        {
          courseId: course.id,
          syllabusText: extractedText || undefined,
          documentBase64: extractedText ? undefined : document?.base64,
          documentMediaType: extractedText ? undefined : document?.mediaType,
          documentName: extractedText ? undefined : document?.name,
        },
        210_000,
      );
      if (typeof result.node_count !== 'number') {
        throw new Error('The parser did not return a saved course tree.');
      }
      parsed = true;

      // An import by a verified instructor is meant to reach students, so
      // publication is not a second button they have to find. The server RPC
      // stays the only thing that can flip the kind: an unverified caller's
      // course simply stays the private practice course it was created as.
      // `fetchQuery` rather than the hook above so a still-loading verification
      // cannot silently skip publication.
      let catalogError: string | null = null;
      try {
        const verified = await queryClient.fetchQuery({
          queryKey: ['instructor-verification'],
          queryFn: fetchInstructorVerification,
        });
        if (verified) await publishOfficialCourse(course.id);
      } catch (cause) {
        catalogError = instructorImportError(cause);
      }
      setPublishFailure(catalogError);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['instructor-courses'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['course-catalog'] }),
      ]);

      // Stay put when publication failed. Navigating on to the chart would hide
      // the one message saying students cannot see this course yet.
      if (catalogError) return;
      onDrawn(course.id);
    } catch (cause) {
      if (createdCourseId && !parsed) {
        await supabase.from('courses').delete().eq('id', createdCourseId);
      }
      setFailure(instructorImportError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="Import a syllabus"
        lede="Upload a PDF, text, or Markdown syllabus. Cardinal reads its topics and prerequisites into a course tree, then publishes it to the official catalog when this account is a verified instructor."
      />

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
              students. Check the database connection and try again.
            </LText>
            <LButton label="Retry verification" size="sm" onPress={() => void verification.refetch()} />
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
            <LButton label="Go to sign in" icon="log-in" size="sm" onPress={onSignIn} />
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

          {failure ? (
            <Notice tone="error" title="Nothing was saved">
              {failure}
            </Notice>
          ) : null}

          {publishFailure ? (
            <Notice tone="error" title="Course created, but not published">
              {publishFailure} The course and its tree are saved under Courses. Students cannot find
              it until you publish it from the chart toolbar.
            </Notice>
          ) : null}

          <View style={styles.rowWrap}>
            <LButton
              label={busy
                ? 'Generating course tree…'
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
        </View>
      </Panel>
    </>
  );
}

// ------------------------------------------------------------------ settings

function Settings({ liveSession, onSignOut }: { liveSession: boolean; onSignOut: () => void }) {
  return (
    <>
      <PageHead title="Settings" lede="What this build can actually do, and the way out." />

      <Panel>
        <PanelHead title="This build" />
        <View style={styles.panelBody}>
          <LText variant="small" style={styles.prose}>
            {liveSession
              ? 'This workspace is connected to a Supabase account. Courses you create are saved to your instructor account and protected by row-level security.'
              : 'This is a local demo session. It can explore the example workspace, but it cannot create courses, import syllabi, or read a live roster.'}
          </LText>
          <LText variant="small" style={styles.prose}>
            Syllabus imports run through the authenticated Supabase parser. PDF, text, and Markdown
            files become course trees, published to the official catalog when this account is a
            verified instructor and kept private to you when it is not.
          </LText>
          <LText variant="small" style={styles.prose}>
            You can read progress only for students enrolled in courses you own. Those instructor
            policies grant reads only; each student remains the only writer of their progress.
          </LText>
          <LText variant="small" style={styles.prose}>
            Students use the rest of this app. Nothing here changes what a student sees until a tree
            is published.
          </LText>
        </View>
      </Panel>

      <Panel>
        <PanelHead title="Session" />
        <View style={styles.panelBody}>
          <LText variant="small" style={styles.prose}>
            Signing out returns to the front door and forgets which surface this device chose. It
            does not clear any course data.
          </LText>
          <View style={styles.rowWrap}>
            <LButton label="Sign out" icon="log-out" onPress={onSignOut} />
          </View>
        </View>
      </Panel>
    </>
  );
}

// --------------------------------------------------------------------- parts

function PageHead({
  title,
  lede,
  action,
}: {
  title: string;
  lede: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.pageHead}>
      <View style={styles.pageHeadText}>
        <LText variant="page">{title}</LText>
        <LText variant="body" tone="muted" style={styles.prose}>
          {lede}
        </LText>
      </View>
      {action}
    </View>
  );
}


/**
 * What the inspector shows while nothing is being edited. The rail and the
 * narrow-screen sheet wrap it differently and must otherwise render exactly the
 * same thing.
 *
 * Read-only on purpose: the editing controls are `NodeEditorPanel`, shared with
 * the student chart, so there is one node property panel in this repo and not
 * two that drift.
 */
function NodeInspector({
  node,
  prereqCount,
  canEdit,
  onStartEdit,
}: {
  node: SkillNode | null;
  prereqCount: number;
  canEdit: boolean;
  onStartEdit: () => void;
}) {
  if (!node) {
    return (
      <View style={styles.inspectorSection}>
        <LText variant="section">No cell selected</LText>
        <LText variant="small" tone="muted">
          Pick a cell on the chart to see what it is worth and what it opens after. The chart is
          drawn exactly as a student receives it.
        </LText>
      </View>
    );
  }

  return (
    <>
      <View style={styles.inspectorSection}>
        <LText variant="section">{node.title}</LText>
        <View style={styles.rowWrap}>
          <Badge label={node.kind} tone="brand" />
          {node.graded === false ? <Badge label="Ungraded practice" tone="gold" /> : null}
          {node.archived ? <Badge label="Retired" tone="attention" /> : null}
        </View>
      </View>

      <View style={styles.inspectorSection}>
        <Figure label="XP" value={String(node.xpReward)} />
        <Figure label="Prerequisites" value={String(prereqCount)} />
      </View>

      {node.description ? (
        <View style={styles.inspectorSection}>
          <LText variant="micro" tone="muted">What it covers</LText>
          <LText variant="small">{node.description}</LText>
        </View>
      ) : null}

      {canEdit ? (
        <LButton label="Edit this node" icon="edit-3" onPress={onStartEdit} />
      ) : null}
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <LText variant="small" tone="muted">
        {label}
      </LText>
      <LText variant="small" numeric style={styles.strong}>
        {value}
      </LText>
    </View>
  );
}

const c = lms.colour;

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: c.ground },
  main: { flex: 1, minWidth: 0 },

  topbar: {
    height: lms.topbar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: lms.space.sm,
    paddingHorizontal: lms.space.lg,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  crumbs: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: lms.space.sm, minWidth: 0 },

  page: { padding: lms.space.lg, gap: lms.space.lg, paddingBottom: lms.space.xxl },
  pageWide: { padding: lms.space.xxl, gap: lms.space.xl, maxWidth: 1180, width: '100%' },
  pageHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: lms.space.lg,
    flexWrap: 'wrap',
  },
  pageHeadText: { flex: 1, minWidth: 240, gap: lms.space.xs },
  // Prose caps at a measure; tables and the canvas deliberately do not.
  prose: { maxWidth: 620 },
  sectionHeading: { marginTop: lms.space.sm },
  panelBody: { padding: lms.space.lg, gap: lms.space.md },
  noticeActions: { gap: lms.space.md, alignItems: 'flex-start' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lms.space.md,
  },
  divider: { flex: 1, height: 1, backgroundColor: c.line },
  rowStack: { gap: 2, minWidth: 0, flex: 1 },
  rowInline: { flexDirection: 'row', alignItems: 'center', gap: lms.space.md, minWidth: 0 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: lms.space.sm, flexWrap: 'wrap' },
  spacer: { flex: 1 },
  strong: { fontWeight: '600' },
  figure: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: lms.space.lg,
    maxWidth: 420,
  },

  // Fixed, not flexible: `flex: 1` here would give the rail flex-basis 0 and let
  // it split the screen with the main column, and 244 would mean nothing.
  rail: {
    width: lms.rail,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: c.surface,
    borderRightWidth: 1,
    borderRightColor: c.line,
  },
  railBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lms.space.md,
    padding: lms.space.md,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  railBrandText: { flex: 1, minWidth: 0 },
  mark: {
    width: 30,
    height: 30,
    borderRadius: lms.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brand,
  },
  railNav: { padding: lms.space.sm, gap: 2 },
  railCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lms.space.md,
    minHeight: 38,
    paddingHorizontal: lms.space.md,
    borderRadius: lms.radius.sm,
  },
  railCellActive: { backgroundColor: c.brandWash },
  railFoot: {
    marginTop: 'auto',
    padding: lms.space.sm,
    gap: lms.space.sm,
    borderTopWidth: 1,
    borderTopColor: c.line,
  },
  railUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lms.space.md,
    paddingHorizontal: lms.space.sm,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: lms.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surfaceSunk,
  },

  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(37,31,32,0.4)' },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: lms.rail,
    flexDirection: 'row',
    shadowColor: '#251f20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 32,
    elevation: 12,
  },

  canvasLayout: { flex: 1 },
  canvasLayoutWide: { flexDirection: 'row' },
  canvasColumn: { flex: 1, minWidth: 0 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lms.space.sm,
    padding: lms.space.md,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  canvasStage: { flex: 1, minHeight: 360 },
  canvasMessage: { padding: lms.space.lg, gap: lms.space.md },
  inspector: {
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.surface,
    flex: 1,
  },
  inspectorScroll: { padding: lms.space.lg, gap: lms.space.lg },
  dialogScroll: { gap: lms.space.md },
  inspectorWide: {
    width: 340,
    flex: 0,
    // `flex: 0` does not clear the `flex-basis: 0%` that `flex: 1` above sets,
    // so on web the rail collapses to its border and `width` never applies.
    flexBasis: 'auto',
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: c.line,
  },
  inspectorSection: { gap: lms.space.sm },
});
