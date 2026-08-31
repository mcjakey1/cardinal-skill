import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEMO_COURSE_ID, DEMO_COURSE_TITLE } from '@/features/skilltree/demoTree';
import { MOCK_COURSES } from '@/features/skilltree/mockCourses';
import { coursesByOwnerType, type CourseOwnerType } from '@/features/skilltree/courseOwnership';
import { deleteInstructorCourse } from '@/features/skilltree/courseQueries';
import { instructorImportError } from '@/lib/syllabusImport';
import type { CourseKind, CoursePublicationStatus } from '@/features/skilltree/courseDistribution';
import { usePrefs } from '@/lib/prefs';
import { useAuth, type UserSession } from '@/auth/AuthContext';
import { usePixelTransition } from '@/ui/PixelTransition';
import { supabase } from '@/lib/supabase';
import { lms } from '@/theme/lms';
import { AdminArea } from '@/ui/AdminArea';
import {
  Badge,
  DataTable,
  Field,
  Icon,
  LButton,
  LModal,
  LText,
  LToggle,
  Notice,
  Panel,
  PanelHead,
  Segmented,
  Skeleton,
  type Column,
  type IconName,
  type TableRow,
} from '@/ui/lms';
import { ImportSyllabus } from '@/ui/instructor/ImportSyllabus';
import { Insights } from '@/ui/instructor/Insights';
import { Students } from '@/ui/instructor/Students';
import { TreeSection } from '@/ui/instructor/TreeSection';
import { PageHead, useInstructorStyles, type CourseRow } from '@/ui/instructor/shared';
import { useLmsTheme } from '@/theme/useLmsTheme';


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
 * Protected writes require a Supabase session. Fixture sessions remain
 * read-only and do not launch server queries they cannot complete.
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

/** The `courses` columns this workspace reads. */
type InstructorCourseDirectoryRow = {
  id: string;
  title: string;
  term: string | null;
  owner_id: string;
  owner_name: string;
  owner_type: string;
  course_kind: CourseKind;
  publication_status: CoursePublicationStatus;
  can_open: boolean;
  can_delete: boolean;
};

/** The server returns only owned instructor courses and moderated student uploads. */
async function fetchAuthorableCourseRows(): Promise<InstructorCourseDirectoryRow[]> {
  const { data, error } = await supabase.rpc('instructor_course_directory');
  if (error) throw error;
  return (data ?? []) as InstructorCourseDirectoryRow[];
}

export default function Instructor() {
  const styles = useInstructorStyles();
  const router = useRouter();
  const { logout, session } = useAuth();
  const { transition } = usePixelTransition();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { lastCourseId, lowBandwidth, motionOff, set } = usePrefs();

  const wide = width >= lms.wide;
  const [section, setSection] = useState<Section>('courses');
  const [drawer, setDrawer] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  // Where the chart was opened from, when it was opened from somewhere that has
  // its own thread to pick back up. Only Admin sets it today: an administrator
  // sent to a chart to decide whether to archive it has a decision waiting, and
  // the rail would drop them back at the top of a page they were part-way down.
  const [returnTo, setReturnTo] = useState<Section | null>(null);
  const liveSession = session?.source === 'supabase';
  const hasInstructorAccess = session?.role === 'instructor';

  useEffect(() => {
    if (!session || hasInstructorAccess) return;
    router.replace({
      pathname: '/tree/[courseId]',
      params: { courseId: lastCourseId ?? DEMO_COURSE_ID },
    });
  }, [hasInstructorAccess, lastCourseId, router, session]);

  const courses = useQuery({
    queryKey: ['instructor-courses'],
    enabled: hasInstructorAccess && liveSession,
    queryFn: async (): Promise<CourseRow[]> => {
      const data = await fetchAuthorableCourseRows();
      return data.map((row) => ({
        id: row.id,
        title: row.title,
        term: row.term,
        ownerId: row.owner_id,
        ownerName: row.owner_name,
        ownerType: row.owner_type === 'student' ? 'student' : 'instructor',
        canOpen: row.can_open,
        canEdit: row.can_open,
        canDelete: row.can_delete,
        kind: row.course_kind,
        publicationStatus: row.publication_status,
      }));
    },
  });

  if (!session || !hasInstructorAccess) return null;

  // The example chart is always in the list. Without a Supabase project behind
  // the app this is the only course there is, and a courses screen that reads
  // empty on a laptop is a workspace nobody can look at.
  const rows: CourseRow[] = [
    ...(courses.data ?? []),
    {
      id: DEMO_COURSE_ID,
      title: DEMO_COURSE_TITLE,
      term: 'MATH 220 · AY 2026',
      ownerId: null,
      ownerName: 'Dr. Maya Santos',
      ownerType: 'instructor',
      canOpen: true,
      canEdit: false,
      canDelete: false,
      kind: 'practice',
      publicationStatus: 'draft',
    },
    ...MOCK_COURSES.map((mock, index): CourseRow => ({
      id: mock.id,
      title: mock.title,
      term: mock.term.replace('Example', 'AY 2026'),
      ownerId: null,
      ownerName: ['Dr. Maya Santos', 'Prof. Elias Navarro', 'Jamie Cruz'][index] ?? 'Cardinal Skill Studio',
      ownerType: index === 2 ? 'student' : 'instructor',
      canOpen: true,
      canEdit: false,
      canDelete: false,
      kind: 'practice',
      publicationStatus: 'draft',
    })),
  ];
  const courseId = chosen ?? lastCourseId ?? DEMO_COURSE_ID;
  const course = rows.find((row) => row.id === courseId && row.canOpen)
    ?? rows.find((row) => row.id === DEMO_COURSE_ID)!;

  const go = (next: Section) => {
    // Any deliberate navigation ends the detour. Leaving the trail set would
    // offer to go "back" to a page the user had already walked away from.
    setReturnTo(null);
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

  /** Open a chart, and remember that Admin is what to go back to. */
  const openChartFromAdmin = (id: string) => {
    open(id);
    // After `open`, whose `go` clears the trail this then sets.
    setReturnTo('admin');
  };

  /**
   * The same detour to a course's roster. An audit row names a person and a
   * course; `Students` draws the roster for the selected course and has no name
   * search of its own, so this lands the reader on the right roster rather than
   * the right row. Honest limitation — the alternative is a second search box
   * on a screen that did not ask for one.
   */
  const openPersonFromAdmin = (courseId: string) => {
    setChosen(courseId);
    go('students');
    setReturnTo('admin');
  };

  // Both sign-out controls — the rail avatar and the Settings panel — ask first.
  // Same question as the student screen, drawn in LMS tokens.
  const signOut = () => {
    setSignOutOpen(false);
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
      session={session}
      onSignOut={() => setSignOutOpen(true)}
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

          {returnTo ? (
            <LButton
              label={`Back to ${SECTION_LABEL[returnTo]}`}
              icon="arrow-left"
              onPress={() => go(returnTo)}
            />
          ) : null}

          <View style={styles.crumbs}>
            {/* The course list is the trail's own root, so on that section the
                prefix would repeat it — "Courses > Research Methods > Courses",
                a path that claims the reader drilled into a course to arrive
                back at the list. There the crumb is just where they are. */}
            {wide && section !== 'courses' ? (
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
                loading={liveSession && courses.isPending}
                onOpen={open}
                onDeleted={(id) => {
                  if (chosen === id) setChosen(null);
                  if (lastCourseId === id) set('lastCourseId', null);
                }}
                onImport={() => go('import')}
                liveSession={liveSession}
              />
            )}
            {section === 'students' && <Students course={course} />}
            {section === 'insights' && <Insights course={course} />}
            {section === 'import' && (
              <ImportSyllabus
                liveSession={liveSession}
                onDrawn={open}
              />
            )}
            {section === 'settings' && (
              <Settings onSignOut={() => setSignOutOpen(true)} />
            )}
            {section === 'admin' && (
              <AdminArea
                liveSession={liveSession}
                courseId={chosen}
                onSelectCourse={setChosen}
                // The workspace already knows how to show a chart. An
                // administrator deciding whether to archive one needs to look at
                // it, not at a second renderer built beside this page.
                onOpenChart={openChartFromAdmin}
                onOpenPerson={openPersonFromAdmin}
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

      {/* Outside the drawer on purpose: the drawer is a later sibling, and a
          dialog rendered inside it would open behind the navigation. */}
      <LModal visible={signOutOpen} title="Sign out?" onRequestClose={() => setSignOutOpen(false)}>
        <LText variant="small" tone="muted" style={styles.prose}>
          This returns to the front door and forgets which surface this device chose. It does not
          delete any course, draft, or student record.
        </LText>
        <View style={styles.rowWrap}>
          <LButton label="Sign out" icon="log-out" variant="primary" onPress={signOut} />
          <LButton label="Stay signed in" variant="quiet" onPress={() => setSignOutOpen(false)} />
        </View>
      </LModal>
    </View>
  );
}

// ----------------------------------------------------------------------- rail

function Rail({
  section,
  onGo,
  onClose,
  closable,
  session,
  onSignOut,
}: {
  section: Section;
  onGo: (next: Section) => void;
  onClose: () => void;
  closable: boolean;
  session: UserSession;
  onSignOut: () => void;
}) {
  const styles = useInstructorStyles();
  const accountName = session.source === 'demo'
    ? 'Dr. Maya Santos'
    : session.name.trim() || session.email || 'Instructor';
  const accountDetail = session.source === 'supabase' ? session.email : 'Instructor';
  const initials = accountInitials(accountName, session.email);

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
        <View
          style={styles.railUser}
          accessible
          accessibilityLabel={`Signed in as ${accountName}, ${accountDetail}`}
        >
          <View style={styles.avatar}>
            <LText variant="small" tone="muted">
              {initials}
            </LText>
          </View>
          <View style={styles.railBrandText}>
            <LText variant="small" style={styles.strong} numberOfLines={1}>
              {accountName}
            </LText>
            <LText variant="small" tone="muted" numberOfLines={1}>
              {accountDetail}
            </LText>
          </View>
          <LButton label="Sign out" icon="log-out" hideLabel variant="quiet" onPress={onSignOut} />
        </View>
      </View>
    </View>
  );
}

function accountInitials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
  const identity = words[0] || email.split('@')[0] || 'Instructor';
  return identity.slice(0, 2).toUpperCase();
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
  const styles = useInstructorStyles();
  const theme = useLmsTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.railCell,
        active ? styles.railCellActive : null,
        !active && hovered ? { backgroundColor: theme.colour.surfaceHover } : null,
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
  { key: 'course', label: 'Course', flex: 2.5 },
  { key: 'owner', label: 'Added by', flex: 2 },
  { key: 'term', label: 'Term', flex: 1.2 },
  { key: 'actions', label: 'Actions', flex: 1.8 },
];

function Courses({
  rows,
  activeId,
  loading,
  onOpen,
  onDeleted,
  onImport,
  liveSession,
}: {
  rows: CourseRow[];
  activeId: string;
  loading: boolean;
  onOpen: (id: string) => void;
  onDeleted: (id: string) => void;
  onImport: () => void;
  liveSession: boolean;
}) {
  const styles = useInstructorStyles();
  const queryClient = useQueryClient();
  const [blankOpen, setBlankOpen] = useState(false);
  const [blankTitle, setBlankTitle] = useState('');
  const [blankCode, setBlankCode] = useState('');
  const [blankBusy, setBlankBusy] = useState(false);
  const [blankError, setBlankError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CourseRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [ownerType, setOwnerType] = useState<CourseOwnerType>('instructor');
  const visibleRows = coursesByOwnerType(rows, ownerType);

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

  const askDelete = (course: CourseRow | null) => {
    setDeleteError(null);
    setDeleting(course);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteInstructorCourse(deleting.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['instructor-courses'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['course-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-courses'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-audit'] }),
      ]);
      onDeleted(deleting.id);
      AccessibilityInfo.announceForAccessibility(`${deleting.title} deleted.`);
      setDeleting(null);
    } catch (cause) {
      const message = cause instanceof Error && cause.message.trim()
        ? cause.message
        : 'The course could not be deleted. Check your connection and try again.';
      setDeleteError(message);
      AccessibilityInfo.announceForAccessibility('The course could not be deleted.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const tableRows: TableRow[] = loading
    ? [0, 1, 2].map((i) => ({
        key: `skeleton-${i}`,
        cells: [
          <Skeleton key="a" width="60%" />,
          <Skeleton key="b" width="55%" />,
          <Skeleton key="c" width="40%" />,
          <Skeleton key="d" width="70%" />,
        ],
      }))
    : visibleRows.map((c) => ({
        key: c.id,
        active: c.id === activeId,
        label: `${c.title}, added by ${c.ownerName}`,
        cells: [
          <View key="title" style={styles.rowStack}>
            <LText variant="small" style={styles.strong} numberOfLines={1}>
              {c.title}
            </LText>
          </View>,
          <LText key="owner" variant="small" numberOfLines={1}>
            {c.ownerName}
          </LText>,
          c.term ?? '—',
          <View key="actions" style={styles.rowInline}>
            {c.canOpen ? <LButton size="sm" label="Open" onPress={() => onOpen(c.id)} /> : null}
            {c.canDelete && liveSession ? (
              <LButton
                size="sm"
                label={`Delete ${c.title}`}
                icon="trash-2"
                hideLabel
                variant="danger"
                disabled={deleteBusy}
                onPress={() => askDelete(c)}
              />
            ) : null}
          </View>,
        ],
      }));

  return (
    <>
      <PageHead
        title="Courses"
        lede="Build instructor courses, or review courses uploaded by student accounts."
        action={(
          <View style={styles.rowWrap}>
            <LButton label="Create blank course" icon="plus" disabled={!liveSession} onPress={openBlank} />
            <LButton label="Import syllabus" icon="upload" variant="primary" disabled={!liveSession} onPress={onImport} />
          </View>
        )}
      />

      <Panel>
        <View style={styles.panelBody}>
          <Segmented
            label="Course owner type"
            value={ownerType}
            onChange={setOwnerType}
            options={[
              {
                value: 'instructor',
                label: `Instructor courses (${coursesByOwnerType(rows, 'instructor').length})`,
              },
              {
                value: 'student',
                label: `Student uploads (${coursesByOwnerType(rows, 'student').length})`,
              },
            ]}
          />
        </View>
        <DataTable
          caption={loading
            ? 'Reading courses'
            : ownerType === 'student'
              ? `${visibleRows.length} student uploads`
              : `${visibleRows.length} instructor courses`}
          columns={COURSE_COLUMNS}
          rows={tableRows}
          empty={(
            <LText variant="small" tone="muted">
              {ownerType === 'student'
                ? 'No student-uploaded courses need review.'
                : 'No instructor courses have been added yet.'}
            </LText>
          )}
        />
      </Panel>

      <LModal
        visible={deleting !== null}
        title={`Delete ${deleting?.title ?? 'this course'}?`}
        onRequestClose={() => { if (!deleteBusy) askDelete(null); }}
      >
        <View style={styles.panelBody}>
          <Notice tone="error" title="This cannot be undone">
            Deleting this course permanently removes its skill tree, enrolments, and every
            student&apos;s progress on it. Archive the course instead if those records must remain.
          </Notice>
          <LText variant="small" tone="muted" style={styles.prose}>
            {deleting?.ownerType === 'student'
              ? `This student upload was added by ${deleting.ownerName}. Your deletion will be recorded in the administrator audit log.`
              : 'Only the instructor who added the course can confirm this action. The deletion will be recorded in the administrator audit log.'}
          </LText>
          {deleteError ? (
            <Notice tone="error" title="The course was not deleted">
              {deleteError}
            </Notice>
          ) : null}
          <View style={styles.rowWrap}>
            <LButton
              label={deleteBusy ? 'Deleting…' : 'Delete course'}
              icon="trash-2"
              variant="danger"
              disabled={deleteBusy}
              onPress={confirmDelete}
            />
            <LButton
              label="Keep course"
              variant="quiet"
              disabled={deleteBusy}
              onPress={() => askDelete(null)}
            />
          </View>
        </View>
      </LModal>

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
        ) : null}
      </LModal>
    </>
  );
}

// ---------------------------------------------------------------------- tree


function Settings({ onSignOut }: { onSignOut: () => void }) {
  const styles = useInstructorStyles();
  const { instructorDarkMode, set } = usePrefs();
  return (
    <>
      <PageHead title="Settings" lede="What this build can actually do, and the way out." />

      <Panel>
        <PanelHead title="Appearance" />
        <View style={styles.panelBody}>
          <View style={styles.figure}>
            <View style={styles.rowStack}>
              <LText variant="body" style={styles.strong}>Dark mode</LText>
              <LText variant="small" tone="muted">
                Use the charcoal instructor workspace on this device.
              </LText>
            </View>
            <LToggle
              label="Dark mode"
              value={instructorDarkMode}
              onChange={(value) => set('instructorDarkMode', value)}
            />
          </View>
        </View>
      </Panel>

      <Panel>
        <PanelHead title="This build" />
        <View style={styles.panelBody}>
          <LText variant="small" style={styles.prose}>
            Course access and student progress are protected by account permissions and row-level security.
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

