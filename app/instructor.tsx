import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { MIN_COHORT, STALE_DAYS, activityFlag } from '@/features/skilltree/cohort';
import { DEMO_COURSE_ID, DEMO_COURSE_TITLE } from '@/features/skilltree/demoTree';
import { resolveName } from '@/features/skilltree/naming';
import { fetchTree } from '@/features/skilltree/queries';
import { validateGraph } from '@/features/skilltree/validation';
import { countChanges, diffCharts } from '@/features/skilltree/chartDiff';
import { hasDestructiveChanges, summariseImpact, type ArchiveImpact } from '@/features/skilltree/chartImpact';
import { fetchArchiveImpact, publishChart } from '@/features/skilltree/publishChart';
import { purgeCourseCache } from '@/lib/editedTree';
import type { NodeKind, SkillNode } from '@/features/skilltree/types';
import type { NodePatch } from '@/features/skilltree/chartDraft';
import { useChartDraft } from '@/lib/useChartDraft';
import { usePrefs } from '@/lib/prefs';
import { useAuth } from '@/auth/AuthContext';
import { usePixelTransition } from '@/ui/PixelTransition';
import { supabase } from '@/lib/supabase';
import { lms } from '@/theme/lms';
import { DitherField } from '@/ui/Dither';
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
 * What this build genuinely has is stated where it matters rather than papered
 * over: the cohort figures come from two security-definer functions that have
 * never run against a live database in this project, and the parser is an Edge
 * Function that has never been deployed from this repository. Both say so on
 * screen instead of showing a number or a progress bar that is not true.
 */

type Section = 'courses' | 'tree' | 'students' | 'insights' | 'import' | 'settings';

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
};

interface CourseRow {
  id: string;
  title: string;
  term: string | null;
  /** True only for the signed-in owner. Publishing is owner-gated in RLS too. */
  canEdit: boolean;
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
  const { logout } = useAuth();
  const { transition } = usePixelTransition();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { lastCourseId, lowBandwidth, motionOff, set } = usePrefs();

  const wide = width >= lms.wide;
  const [section, setSection] = useState<Section>('courses');
  const [drawer, setDrawer] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const courses = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: async (): Promise<CourseRow[]> => {
      const [{ data, error }, { data: auth }] = await Promise.all([
        supabase
          .from('courses')
          .select('id, title, term, owner_id')
          .order('created_at', { ascending: false }),
        supabase.auth.getUser(),
      ]);
      if (error) throw error;
      return (data ?? []).map(({ id, title, term, owner_id }) => ({
        id,
        title,
        term,
        canEdit: Boolean(auth.user?.id) && owner_id === auth.user?.id,
      }));
    },
  });

  // The example chart is always in the list. Without a Supabase project behind
  // the app this is the only course there is, and a courses screen that reads
  // empty on a laptop is a workspace nobody can look at.
  const rows: CourseRow[] = [
    ...(courses.data ?? []),
    { id: DEMO_COURSE_ID, title: DEMO_COURSE_TITLE, term: 'Example chart', canEdit: false },
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
            onAuthor={() => router.navigate('/author')}
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
              />
            )}
            {section === 'students' && <Students course={course} />}
            {section === 'insights' && <Insights course={course} />}
            {section === 'import' && <ImportSyllabus onDrawn={open} />}
            {section === 'settings' && (
              <Settings
                onSignOut={signOut}
              />
            )}
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
}: {
  rows: CourseRow[];
  activeId: string;
  loading: boolean;
  error: unknown;
  onOpen: (id: string) => void;
  onImport: () => void;
}) {
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
        lede="Every course on this device. Opening one loads its tree, its class figures, and the import that drew it."
        action={<LButton label="Import a syllabus" icon="upload" onPress={onImport} />}
      />

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
  onAuthor,
  onStudentView,
}: {
  course: CourseRow;
  canEdit: boolean;
  wide: boolean;
  flat: boolean;
  motionOff: boolean;
  onImport: () => void;
  onAuthor: () => void;
  onStudentView: () => void;
}) {
  const [selected, setSelected] = useState<SkillNode | null>(null);
  const [editing, setEditing] = useState(false);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['instructor-tree', course.id],
    queryFn: () => fetchTree(course.id),
  });

  const queryClient = useQueryClient();
  const { draft, ready, edit, undoEdit, redoEdit, reset, canUndo, canRedo } = useChartDraft(
    canEdit ? course.id : undefined,
  );

  // Seed once per course, and only from a fresh read. A draft already holding
  // edits must survive a refetch, or a background refresh silently discards
  // work in progress.
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!canEdit || !data || !ready) return;
    if (seeded.current === course.id) return;
    seeded.current = course.id;
    if (draft.ops.length === 0) {
      reset({ nodes: data.tree.nodes, prereqs: data.tree.prereqs, missions: data.missions });
    }
  }, [canEdit, course.id, data, draft.ops.length, ready, reset]);

  // `selected` is a snapshot from the moment of the click. Everything below
  // reads the live row so an edit is never applied to a pre-publish copy.
  const live = data?.tree.nodes.find((n) => n.id === selected?.id) ?? null;

  // A different node means a fresh form, never the previous node's half-typed one.
  useEffect(() => {
    setEditing(false);
  }, [selected?.id]);

  const [editMode, setEditMode] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  // In edit mode the canvas draws the draft, so an unpublished change shows
  // where it was made. Archived nodes are already gone as far as a student goes.
  const shown = useMemo(
    () => ({
      nodes: draft.working.nodes.filter((n) => !n.archived),
      prereqs: draft.working.prereqs,
    }),
    [draft.working],
  );

  const notice = (text: string) => {
    setLinkNotice(text);
    setTimeout(() => setLinkNotice(null), 2400);
  };

  const addNode = (at: { x: number; y: number }) => {
    const node: SkillNode = {
      id: crypto.randomUUID(),
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
  };

  const startLink = () => {
    if (!selected) {
      notice('Select a node first');
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
    if (linkSourceId === node.id) {
      notice('A node cannot require itself');
      return;
    }
    const next = [...draft.working.prereqs, { nodeId: node.id, prereqId: linkSourceId }];
    const check = validateGraph(draft.working.nodes, next);
    if (!check.isValid) {
      notice(check.errors[0]?.message ?? 'That link would create a loop');
      cancelLink();
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
  const changes = useMemo(() => diffCharts(liveState, draft.working), [liveState, draft.working]);
  const validation = useMemo(
    () => validateGraph(draft.working.nodes.filter((n) => !n.archived), draft.working.prereqs),
    [draft.working],
  );

  const [confirming, setConfirming] = useState(false);
  const [impact, setImpact] = useState<ArchiveImpact[]>([]);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const openConfirm = async () => {
    setPublishError(null);
    const rows = await fetchArchiveImpact(course.id, changes.archiveNodes).catch(() => []);
    setImpact(summariseImpact(changes, liveState, rows));
    setConfirming(true);
  };

  const doPublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      // Re-read before writing. Another instructor, or a syllabus re-parse, may
      // have moved the chart since this draft started; publishing over that
      // silently would be last-write-wins on someone else's work.
      const fresh = await fetchTree(course.id);
      const movedUnderneath =
        JSON.stringify(fresh.tree.nodes.map((n) => n.id).sort())
        !== JSON.stringify(draft.baseline.nodes.map((n) => n.id).sort());
      if (movedUnderneath) {
        setPublishError('This chart changed since you started editing. Reload before publishing.');
        return;
      }

      await publishChart(course.id, changes);
      await purgeCourseCache(course.id);
      reset({ nodes: fresh.tree.nodes, prereqs: fresh.tree.prereqs, missions: fresh.missions });
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

  const saveNodePatch = (patch: NodePatch) => {
    if (!live) return;
    edit({
      t: 'field',
      nodeId: live.id,
      before: {
        titleOverride: live.titleOverride ?? null,
        description: live.description,
        kind: live.kind,
        xpReward: live.xpReward,
      },
      after: patch,
    });
    setEditing(false);
  };

  const inspectorBody = (
    <NodeInspector
      node={live}
      prereqCount={data?.tree.prereqs.filter((p) => p.nodeId === live?.id).length ?? 0}
      canEdit={canEdit}
      editing={editing}
      onStartEdit={() => setEditing(true)}
      onCancelEdit={() => setEditing(false)}
      onSave={saveNodePatch}
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
          {canEdit && countChanges(changes) > 0 ? (
            <>
              <Badge label={`${countChanges(changes)} unpublished`} tone="gold" />
              <LButton label="Undo" icon="rotate-ccw" size="sm" disabled={!canUndo} onPress={undoEdit} />
              <LButton label="Redo" icon="rotate-cw" size="sm" disabled={!canRedo} onPress={redoEdit} />
              <LButton
                label="Publish"
                variant="primary"
                size="sm"
                disabled={!validation.isValid}
                onPress={openConfirm}
              />
            </>
          ) : null}
          <LButton label="Edit by hand" icon="edit-3" size="sm" onPress={onAuthor} />
          <LButton
            label="Open as a student"
            icon="external-link"
            size="sm"
            onPress={onStudentView}
          />
        </View>

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
              tree={editMode && canEdit ? shown : data.tree}
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
                      if (!next) cancelLink();
                    }
                  : undefined
              }
              onAddNode={canEdit ? addNode : undefined}
              onToggleLinkMode={canEdit ? startLink : undefined}
              onCancelLink={canEdit ? cancelLink : undefined}
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
            setEditing(false);
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.inspectorScroll}>{inspectorBody}</ScrollView>
          </KeyboardAvoidingView>
        </LModal>
      )}
      </View>

      {/* Outside the section's layout on purpose. Anything absolutely positioned
          inside it renders below the nav drawer, a later sibling of `main`. */}
      <LModal visible={confirming} title="Publish changes" onRequestClose={() => setConfirming(false)}>
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
                Their XP stays banked, and you can restore it.
              </LText>
            ))}
          </Notice>
        ) : null}

        {publishError ? <Notice tone="error" title="Not published">{publishError}</Notice> : null}

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

function ImportSyllabus({ onDrawn }: { onDrawn: (courseId: string) => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const ready = title.trim().length > 0 && text.trim().length > 0 && !busy;

  // ponytail: the same two calls `app/upload.tsx` makes, written out again
  // rather than shared, because the two screens report them completely
  // differently — a pixel log there, a notice here. Extract if a third caller
  // turns up.
  const submit = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({ title: title.trim() })
        .select('id')
        .single();
      if (courseError || !course) throw courseError ?? new Error('No course was returned.');

      const { error } = await supabase.functions.invoke('parse-syllabus', {
        body: { courseId: course.id, syllabusText: text },
      });
      if (error) throw error;

      onDrawn(course.id);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="Import a syllabus"
        lede="Paste the syllabus text and the parser reads it into a tree of what depends on what. You review the result before any student sees it."
      />

      <Panel>
        <View style={styles.panelBody}>
          <Field
            label="Course name"
            value={title}
            onChangeText={setTitle}
            placeholder="Statistics 101"
          />
          <Field
            label="Syllabus text"
            value={text}
            onChangeText={setText}
            tall
            placeholder="Week 1 — Describing data…"
            hint="PDF and DOCX text is extracted server-side, which is not wired in this build. Paste the text for now."
          />

          {failure ? (
            <Notice tone="error" title="Nothing was saved">
              {failure} The parser is a Supabase Edge Function that has not been deployed from this
              repository, so this is the expected result on a machine with no backend.
            </Notice>
          ) : null}

          <View style={styles.rowWrap}>
            <LButton
              label={busy ? 'Reading…' : 'Draw the tree'}
              variant="primary"
              icon="git-branch"
              disabled={!ready}
              onPress={submit}
            />
            <LText variant="small" tone="muted">
              You review the tree before publishing it.
            </LText>
          </View>
        </View>
      </Panel>
    </>
  );
}

// ------------------------------------------------------------------ settings

function Settings({ onSignOut }: { onSignOut: () => void }) {
  return (
    <>
      <PageHead title="Settings" lede="What this build can actually do, and the way out." />

      <Panel>
        <PanelHead title="This build" />
        <View style={styles.panelBody}>
          <LText variant="small" style={styles.prose}>
            Authentication is not wired. The workspace sign-in chooses which surface you see and
            unlocks nothing — every class figure still comes from a database function gated on the
            signed-in account, and there is no account.
          </LText>
          <LText variant="small" style={styles.prose}>
            The syllabus parser is a Supabase Edge Function that has not been deployed from this
            repository. Class figures come from course_cohort_summary and course_mission_summary,
            and the roster from course_student_progress — three database functions that have never
            run against a live database in this project. Until 0005_instructor_reads is applied,
            Students has nothing to read and says so rather than showing anyone.
          </LText>
          <LText variant="small" style={styles.prose}>
            When it is applied, you can read the progress of students on courses you own, by name.
            You cannot change it: those policies grant reads only, and a student&apos;s record stays
            theirs to write.
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

const KINDS: { value: NodeKind; label: string }[] = [
  { value: 'topic', label: 'Topic' },
  { value: 'reading', label: 'Reading' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'project', label: 'Project' },
];

/** XP the database accepts is 0–10000; this is the range a node is worth reading. */
const XP_MIN = 1;
const XP_MAX = 2000;

function NodeEditor({
  node,
  onSave,
  onCancel,
}: {
  node: SkillNode;
  onSave: (patch: NodePatch) => void;
  onCancel: () => void;
}) {
  const resolved = resolveName({
    override: node.titleOverride,
    generated: node.questTitle,
    syllabus: node.title,
  });

  const [name, setName] = useState(resolved.text);
  const [description, setDescription] = useState(node.description);
  const [kind, setKind] = useState<NodeKind>(node.kind);
  const [xp, setXp] = useState(String(node.xpReward));

  const xpValue = Number.parseInt(xp, 10);
  const xpError = Number.isNaN(xpValue) || xpValue < XP_MIN || xpValue > XP_MAX
    ? `A node is worth between ${XP_MIN} and ${XP_MAX} XP.`
    : undefined;
  const nameError = name.trim() === '' ? 'A node needs a name.' : undefined;

  return (
    <View style={styles.inspectorSection}>
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        error={nameError}
        hint={
          resolved.source === 'override'
            ? 'Typed by hand. Quest naming leaves it alone.'
            : resolved.source === 'generated'
              ? 'Generated. Editing it pins the name against the next run.'
              : 'From the syllabus.'
        }
      />

      <Field label="What it covers" value={description} onChangeText={setDescription} tall />

      <Field
        label="XP"
        value={xp}
        onChangeText={setXp}
        keyboardType="number-pad"
        error={xpError}
      />

      <Segmented label="Kind" options={KINDS} value={kind} onChange={setKind} />

      <View style={styles.rowWrap}>
        <LButton
          label="Save"
          variant="primary"
          disabled={Boolean(nameError || xpError)}
          onPress={() =>
            onSave({
              // The name is written as an override, never over the syllabus
              // title. That is the column `name-quest` checks before it
              // renames anything (0002:45).
              titleOverride: name.trim() === node.title.trim() ? null : name.trim(),
              description,
              kind,
              xpReward: xpValue,
            })
          }
        />
        <LButton label="Cancel" variant="quiet" onPress={onCancel} />
        {resolved.source === 'override' ? (
          <LButton
            label="Reset to generated name"
            variant="quiet"
            onPress={() => onSave({ titleOverride: null })}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * What the inspector shows, without the surround. The rail and the narrow-screen
 * sheet wrap it differently and must otherwise render exactly the same thing.
 */
function NodeInspector({
  node,
  prereqCount,
  canEdit,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
}: {
  node: SkillNode | null;
  prereqCount: number;
  canEdit: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: NodePatch) => void;
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

  if (editing) {
    return <NodeEditor node={node} onSave={onSave} onCancel={onCancelEdit} />;
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
