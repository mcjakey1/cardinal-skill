import { StyleSheet, View } from 'react-native';

import { mergeRoster, type RosterView } from '@/features/skilltree/roster';
import { DEMO_COURSE_ID } from '@/features/skilltree/demoTree';
import { findMockCourse } from '@/features/skilltree/mockCourses';
import type { CourseKind, CoursePublicationStatus } from '@/features/skilltree/courseDistribution';
import { supabase } from '@/lib/supabase';
import { lms } from '@/theme/lms';
import { LText } from '@/ui/lms';

/**
 * What every section of the instructor workspace is built from: the course row
 * they all render, the two reads that more than one section needs, the page
 * heading, and the stylesheet.
 *
 * One sheet on purpose — the workspace is one visual surface, and a per-section
 * sheet is how a rail cell and a table header drift apart. `c` is kept short
 * because it appears inline in style objects; it is `lms.colour` and nothing
 * else.
 */

export interface CourseRow {
  id: string;
  title: string;
  term: string | null;
  /** True only for the signed-in owner. Publishing is owner-gated in RLS too. */
  canEdit: boolean;
  kind: CourseKind;
  publicationStatus: CoursePublicationStatus;
}

// --------------------------------------------------------------- cohort query

export type MissionReach =
  | { kind: 'no-session' }
  | { kind: 'fixture' }
  /** Mission id → students who completed it. Missions under the floor are absent. */
  | { kind: 'ready'; completions: [string, number][] };

/**
 * How many students have finished each mission on a course.
 *
 * The only server read Class insights makes of its own; the roster and the
 * chart come from the queries the Students and Skill tree tabs already run, so
 * opening this tab costs one RPC and not four.
 *
 * `course_mission_summary` is a security-definer function keyed on `auth.uid()`,
 * and it cannot tell "nobody signed in" from "not this course's owner" from
 * "every mission is under the five-student floor" — all three arrive as zero
 * rows. Asking for the session first is what keeps the empty states apart on
 * screen.
 */
export async function fetchMissionReach(courseId: string): Promise<MissionReach> {
  // The example chart and the sample courses have ids like 'demo', and the RPC
  // parameter is a uuid: Postgres rejects the cast with 22P02 and the screen
  // shows a database error for a course that was never in the database. The
  // roster hit the identical bug. Fixtures have no class, so do not ask.
  if (courseId === DEMO_COURSE_ID || findMockCourse(courseId)) return { kind: 'fixture' };

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { kind: 'no-session' };

  const { data, error } = await supabase.rpc('course_mission_summary', {
    p_course_id: courseId,
  });
  if (error) throw error;

  return {
    kind: 'ready',
    completions: (data ?? []).map((m: Record<string, unknown>) => [
      String(m.mission_id),
      Number(m.completed_count ?? 0),
    ]),
  };
}

// --------------------------------------------------------------- roster query

export type Roster =
  | { kind: 'no-session' }
  /** The example chart. Not a row in `courses`, so it has no roster to read. */
  | { kind: 'example' }
  /** A real course, but not this caller's. `course_roster` said so out loud. */
  | { kind: 'not-owned' }
  | { kind: 'ready'; view: RosterView };

/**
 * PostgREST when a function is absent from its schema cache, Postgres when the
 * function is not there at all. `0030_roster_contacts.sql` has not reached every
 * project yet, and its absence should cost the email column, not the panel.
 */
const FUNCTION_MISSING = ['PGRST202', '42883'];

/**
 * Every student on one course, by name and address.
 *
 * Two reads, because the two answers have different privacy rules. Names and
 * emails come from `course_roster` (0029), which raises rather than returning
 * nothing when the caller does not own the course — deliberately, because
 * "nobody is enrolled" and "not your class" look identical when both come back
 * empty, and telling them apart is most of what was wrong with this screen.
 * Figures come from `course_student_progress` (0005, 0027), which covers only
 * the enrolled.
 *
 * The example chart reaches neither. Its id is the string `demo` rather than a
 * uuid, so the RPC rejected it at the type boundary and the panel showed a
 * Postgres cast error where a roster should be — the reported "does not load",
 * word for word, on the course this workspace opens with.
 */
export async function fetchRoster(courseId: string): Promise<Roster> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { kind: 'no-session' };
  if (courseId === DEMO_COURSE_ID) return { kind: 'example' };

  const [contacts, progress] = await Promise.all([
    supabase.rpc('course_roster', { p_course_id: courseId }),
    supabase.rpc('course_student_progress', { p_course_id: courseId }),
  ]);

  if (contacts.error?.code === '42501') return { kind: 'not-owned' };
  if (progress.error) throw progress.error;
  if (contacts.error && !FUNCTION_MISSING.includes(contacts.error.code ?? '')) throw contacts.error;

  return {
    kind: 'ready',
    view: mergeRoster(
      contacts.error
        ? null
        : (contacts.data ?? []).map((r: Record<string, unknown>) => ({
            userId: String(r.user_id),
            displayName: String(r.display_name),
            email: String(r.email ?? ''),
            enrolled: r.enrolled === true,
          })),
      (progress.data ?? []).map((r: Record<string, unknown>) => ({
        userId: String(r.user_id),
        displayName: String(r.display_name),
        mastered: Number(r.mastered ?? 0),
        gradedNodes: Number(r.graded_nodes ?? 0),
        progress: Number(r.progress ?? 0),
        xp: Number(r.xp ?? 0),
        lastActive: r.last_active ? String(r.last_active) : null,
      })),
    ),
  };
}

export function PageHead({
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

export const c = lms.colour;

export const styles = StyleSheet.create({
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
  // Sits in the toolbar row beside the disabled Publish, so it wraps rather
  // than pushing the buttons off a narrow screen.
  publishBlocked: { flexShrink: 1, maxWidth: 420 },
  strong: { fontWeight: '600' },
  figure: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: lms.space.lg,
    maxWidth: 420,
  },

  // Class insights. The action line sits on its own washed foot so it reads as
  // the panel's conclusion rather than another row of body copy.
  insightAction: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: lms.space.md,
    padding: lms.space.lg,
    backgroundColor: c.brandWash,
    borderTopWidth: 1,
    borderTopColor: c.line,
  },
  limitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: lms.space.md },

  // One bar per band of the class. One hue at one intensity: the bands are
  // positions on a scale, not four things competing, and a darker-where-bigger
  // ramp would invite reading a value off the colour.
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: lms.space.md, minHeight: 28 },
  bandLabel: { width: 118, flexShrink: 0 },
  bandTrack: {
    flex: 1,
    minWidth: 60,
    height: 14,
    borderRadius: lms.radius.xs,
    backgroundColor: c.surfaceSunk,
    overflow: 'hidden',
  },
  bandFill: { height: '100%', borderRadius: lms.radius.xs, backgroundColor: c.brand },
  // Wide enough for "12 of 24" so the bars all end on the same line.
  bandCount: { width: 92, flexShrink: 0, textAlign: 'right' },

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
    // The rail is the workspace's primary navigation and is reachable by touch
    // on a tablet, so it keeps the same floor every other control here keeps.
    minHeight: lms.touch,
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
    // The panel lift, cast further: same ink, a drawer's worth of throw.
    ...lms.lift,
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
    // Wraps like `rowWrap` above. Without it the chart toolbar's buttons run
    // off a 390dp phone and take the whole document into a horizontal scroll,
    // which slides the page out from under anything drawn over it.
    flexWrap: 'wrap',
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
