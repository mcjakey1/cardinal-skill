import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { MIN_COHORT, STALE_DAYS } from '@/features/skilltree/cohort';
import {
  bottlenecks,
  classSpread,
  clearedUpperBounds,
  studentsToWatch,
  type Bottleneck,
  type GraphEdge,
  type GraphNode,
  type ProgressRow,
  type WatchRow,
} from '@/features/skilltree/classInsights';
import { DEMO_COURSE_ID, DEMO_COURSE_TITLE } from '@/features/skilltree/demoTree';
import { findMockCourse } from '@/features/skilltree/mockCourses';
import { resolveName } from '@/features/skilltree/naming';
import { fetchTree } from '@/features/skilltree/queries';
import {
  DataTable,
  Icon,
  LButton,
  LText,
  Notice,
  Panel,
  PanelHead,
  Skeleton,
} from '@/ui/lms';
import {
  PageHead,
  fetchMissionReach,
  fetchRoster,
  useInstructorStyles,
  type CourseRow,
} from './shared';

/** Fixed so the sample class does not drift as the real clock moves. */
const SAMPLE_NOW = new Date('2026-03-01T09:00:00.000Z');

const daysBefore = (from: Date, days: number): string =>
  new Date(from.getTime() - days * 86_400_000).toISOString();

const SAMPLE_INSIGHTS: {
  students: ProgressRow[];
  nodes: GraphNode[];
  prereqs: GraphEdge[];
  cleared: [string, number | null][];
} = {
  students: [
    ...Array.from({ length: 8 }, (_, i) => ({
      userId: `sample-low-${i}`,
      displayName: `Student ${i + 1}`,
      mastered: i === 0 ? 0 : 1,
      gradedNodes: 6,
      progress: i === 0 ? 0 : 17,
      lastActive: i === 0 ? null : daysBefore(SAMPLE_NOW, i < 3 ? 26 : 3),
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      userId: `sample-mid-${i}`,
      displayName: `Student ${i + 9}`,
      mastered: 3,
      gradedNodes: 6,
      progress: 50,
      lastActive: daysBefore(SAMPLE_NOW, 2),
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      userId: `sample-high-${i}`,
      displayName: `Student ${i + 11}`,
      mastered: 6,
      gradedNodes: 6,
      progress: 100,
      lastActive: daysBefore(SAMPLE_NOW, 1),
    })),
  ],
  nodes: [
    { id: 'sample-1', title: 'Describing data' },
    { id: 'sample-2', title: 'Probability basics' },
    { id: 'sample-3', title: 'Sampling distributions' },
    { id: 'sample-4', title: 'Confidence intervals' },
    { id: 'sample-5', title: 'Hypothesis testing' },
    { id: 'sample-6', title: 'Reporting a result' },
  ],
  prereqs: [
    { nodeId: 'sample-2', prereqId: 'sample-1' },
    { nodeId: 'sample-3', prereqId: 'sample-2' },
    { nodeId: 'sample-4', prereqId: 'sample-3' },
    { nodeId: 'sample-5', prereqId: 'sample-3' },
    { nodeId: 'sample-6', prereqId: 'sample-5' },
  ],
  cleared: [
    ['sample-1', 19],
    ['sample-2', 14],
    // 'sample-3' is measured and withheld — under five cleared it. That is a
    // null entry, not an absent key: absence means no mission data exists for
    // the node, which is a different fact and is left out of the ranking
    // entirely rather than read as a low number.
    ['sample-3', null],
    ['sample-4', 9],
  ],
};

// -------------------------------------------------------------------- the app


/**
 * What this class needs from the instructor next week.
 *
 * The screen this replaced showed an average, a total, and a completion count
 * per skill: three true numbers, none of which named anything to do. The rules
 * behind what is here now, and the evidence for each, are in
 * `src/features/skilltree/classInsights.ts` — including what was left out on
 * purpose. There is no leaderboard, no XP panel and no per-student ranking, and
 * that is a finding rather than an omission.
 *
 * Panels are ordered by what an instructor can act on soonest, not by how
 * impressive the number is. Every one carries a line saying what it means and a
 * line saying what to do, because a figure with no implied action is what made
 * the old screen useless.
 *
 * Three reads feed it and only one is its own: the roster and the chart come
 * from the queries the Students and Skill tree tabs already run, under the same
 * keys, so this tab reuses their cache instead of asking again.
 */
export function Insights({ course }: { course: CourseRow }) {
  const styles = useInstructorStyles();
  const [sample, setSample] = useState(false);
  // Fixture courses have ids like 'demo' and no class behind them; every query
  // below would either fail its uuid cast or return nothing.
  const fixture = course.id === DEMO_COURSE_ID || Boolean(findMockCourse(course.id));

  const roster = useQuery({
    queryKey: ['instructor-roster', course.id],
    queryFn: () => fetchRoster(course.id),
    enabled: !fixture,
  });
  const tree = useQuery({
    queryKey: ['instructor-tree', course.id],
    queryFn: () => fetchTree(course.id),
    enabled: !fixture,
  });
  const reach = useQuery({
    queryKey: ['instructor-cohort', course.id],
    queryFn: () => fetchMissionReach(course.id),
    enabled: !fixture,
  });

  // One clock for the whole render, so two panels cannot disagree about today.
  const now = useMemo(() => new Date(), []);

  const live = useMemo(() => {
    // All three, or none. With the mission counts still in flight every node
    // reads as withheld, and a panel that says "at least 20 students" for half a
    // second before settling on nine has told the instructor something false.
    if (roster.data?.kind !== 'ready' || !tree.data || reach.data?.kind !== 'ready') return null;
    // Only when those rows are actually this course's class. The roster falls
    // back to listing registered accounts while nothing is enrolled, which is
    // the right thing for a contact list and the wrong thing for every figure
    // here: "eight students are stuck on this skill" about people who were
    // never given the course is a false statement, not a sparse one. The
    // no-contacts mode is still the enrolled class — it only means 0029 has not
    // been applied, so no email came back.
    if (roster.data.view.mode === 'registered') return null;
    const nodes = tree.data.tree.nodes.filter((n) => !n.archived);
    return {
      now,
      students: roster.data.view.rows,
      nodes: nodes.map((n) => ({
        id: n.id,
        // The same name precedence every other screen uses — override, then
        // generated, then syllabus. Reading `title` directly would make this the
        // one screen showing a syllabus heading where the app shows a quest.
        title: resolveName({
          override: n.titleOverride,
          generated: n.questTitle,
          syllabus: n.title,
        }).text,
      })),
      prereqs: tree.data.tree.prereqs,
      cleared: clearedUpperBounds(tree.data.missions, new Map(reach.data.completions)),
    };
  }, [roster.data, tree.data, reach.data, now]);

  const sampled = useMemo(
    () => ({
      now: SAMPLE_NOW,
      students: SAMPLE_INSIGHTS.students,
      nodes: SAMPLE_INSIGHTS.nodes,
      prereqs: SAMPLE_INSIGHTS.prereqs,
      cleared: new Map(SAMPLE_INSIGHTS.cleared),
    }),
    [],
  );

  const source = sample ? sampled : live;

  const toggle = (
    <LButton
      label={sample ? 'Hide the sample class' : 'Show me a sample class'}
      icon={sample ? 'eye-off' : 'eye'}
      onPress={() => setSample((on) => !on)}
    />
  );

  const error = roster.error ?? tree.error ?? reach.error;
  const pending = !sample && !fixture && (roster.isPending || tree.isPending || reach.isPending);
  const noSession = roster.data?.kind === 'no-session' || reach.data?.kind === 'no-session';
  const emptyClass = !sample && live !== null && live.students.length === 0;
  // `live` is null for more reasons than "no class": the roster may be listing
  // registered accounts rather than this course's students, or the course may
  // belong to someone else. Every other branch here needs `live` to be present,
  // so without this one the page renders its heading and nothing else — no
  // notice, no error, not even the sample toggle, and no way forward.
  const noClassToRead = !sample && !fixture && !pending && !error && !noSession && live === null;

  return (
    <>
      <PageHead
        title="Class insights"
        lede={`What ${course.title} needs from you next week. Each panel says what it means and what to do about it. Anything worked out over a group smaller than ${MIN_COHORT} students stays hidden, because a figure over a handful of people points at those people.`}
      />

      {sample ? (
        <Notice tone="attention" title="Sample class — every student and number below is made up">
          No database was read and nobody is signed in. This is the layout, filled with an invented
          class of twenty chosen to show the panels working.
        </Notice>
      ) : null}

      {!sample && fixture ? (
        <>
          <Notice title="The example chart has no class">
            {DEMO_COURSE_TITLE} is a sample chart for looking at, not a course anybody is enrolled
            on, so there is nothing to measure. Open one of your own courses, or look at a sample
            class below.
          </Notice>
          {toggle}
        </>
      ) : null}

      {pending ? (
        <Panel>
          <View style={styles.panelBody}>
            <Skeleton width="55%" />
            <Skeleton width="35%" />
            <Skeleton width="45%" />
          </View>
        </Panel>
      ) : null}

      {!sample && !fixture && error ? (
        <>
          <Notice tone="error" title="The class figures did not load">
            {error instanceof Error ? error.message : 'The figures could not be read.'}
          </Notice>
          <View style={styles.rowWrap}>
            <LButton
              label="Try again"
              onPress={() => {
                roster.refetch();
                tree.refetch();
                reach.refetch();
              }}
            />
            {toggle}
          </View>
        </>
      ) : null}

      {!sample && !fixture && !error && noSession ? (
        <>
          <Notice tone="attention" title="Sign-in needed for real figures">
            These figures come from database functions gated on the signed-in account, and sign-in
            is not wired up in this build. Nothing is invented to stand in for them.
          </Notice>
          {toggle}
        </>
      ) : null}

      {emptyClass ? (
        <>
          <Notice tone="attention" title="Nobody is enrolled on this course yet">
            Every panel here counts students, and this course has none, so there is nothing to
            count. Enrolling students is not wired up in this build. Look at a sample class to see
            what this page says once there is one.
          </Notice>
          {toggle}
        </>
      ) : null}

      {noClassToRead ? (
        <>
          <Notice tone="attention" title="No class to measure yet">
            <LText variant="small">
              {roster.data?.kind === 'not-owned'
                ? 'This course belongs to another account, so its class is not yours to read.'
                : 'The Students tab is listing registered accounts rather than students enrolled on this course, and none of these figures would describe your class. They will fill in once students are enrolled here.'}
            </LText>
          </Notice>
          {toggle}
        </>
      ) : null}

      {source && source.students.length > 0 ? (
        <>
          <StuckPanel
            rows={bottlenecks(source.nodes, source.prereqs, source.cleared, source.students.length)}
            classSize={source.students.length}
          />
          <WatchPanel list={studentsToWatch(source.students, source.now)} />
          <SpreadPanel result={classSpread(source.students)} />
          <LimitsPanel />
          {sample ? toggle : null}
        </>
      ) : null}
    </>
  );
}

/**
 * A one-line "what this is" above the numbers and a one-line "what to do" below
 * them. Both are required: the research on these dashboards is consistent that
 * instructors read a figure, agree it is interesting, and change nothing.
 */
function InsightPanel({
  title,
  meaning,
  action,
  children,
}: {
  title: string;
  meaning: string;
  action?: string;
  children: React.ReactNode;
}) {
  const styles = useInstructorStyles();
  return (
    <Panel>
      <PanelHead title={title} />
      <View style={styles.panelBody}>
        <LText variant="body" tone="muted" style={styles.prose}>
          {meaning}
        </LText>
      </View>
      {children}
      {action ? (
        <View style={styles.insightAction}>
          <Icon name="arrow-right" size={16} tone="brand" />
          <LText variant="body" style={[styles.prose, styles.strong]}>
            {action}
          </LText>
        </View>
      ) : null}
    </Panel>
  );
}

/** Shown in place of a figure, saying which rule hid it and why. */
function Withheld({ reason }: { reason: string }) {
  const styles = useInstructorStyles();
  return (
    <View style={styles.panelBody}>
      <Notice tone="attention" title="Not enough students to say">
        {reason}
      </Notice>
    </View>
  );
}

// --------------------------------------------------------------- 1. stuck

function StuckPanel({
  rows,
  classSize,
}: {
  rows: Bottleneck[] | { suppressed: true; size: number; reason: string };
  classSize: number;
}) {
  const styles = useInstructorStyles();
  const meaning =
    'A skill counts as a hold-up when a lot of people have not cleared it and a lot of the course sits behind it. The top row is costing this class the most.';

  if (!Array.isArray(rows)) {
    return (
      <InsightPanel title="Where the class is stuck" meaning={meaning}>
        <Withheld reason={rows.reason} />
      </InsightPanel>
    );
  }

  const worst = rows[0];
  return (
    <InsightPanel
      title="Where the class is stuck"
      meaning={meaning}
      action={
        // "At least" in both branches, because it is true in both: where the
        // count is known it is a ceiling on who cleared the skill, so the number
        // behind it is a floor either way.
        worst
          ? `Spend next week on ${worst.title}. It opens ${countOf(worst.blocks, 'later skill')}, and at least ${countOf(worst.waitingAtLeast, 'student')} of ${classSize} are still behind it.`
          : undefined
      }
    >
      <DataTable
        columns={[
          { key: 'title', label: 'Skill', flex: 3 },
          // Not `num`: the cell is a sentence when the count is withheld, and a
          // right-aligned column of mixed words and figures reads as neither.
          { key: 'behind', label: 'Students behind it', flex: 2 },
          { key: 'blocks', label: 'Later skills it opens', num: true, flex: 2 },
        ]}
        rows={rows.map((row) => ({
          key: row.nodeId,
          label: `${row.title}. At least ${row.waitingAtLeast} of ${classSize} students have not cleared it. It opens ${row.blocks} later skills.`,
          cells: [row.title, `at least ${row.waitingAtLeast} of ${classSize}`, String(row.blocks)],
        }))}
        empty={
          <LText variant="body" tone="muted">
            Nothing in this course has anything behind it, so no one skill can hold the class up.
          </LText>
        }
      />
      <View style={styles.panelBody}>
        <LText variant="small" tone="muted" style={styles.prose}>
          &ldquo;At least&rdquo; is exact, not vague. Completions are recorded per piece of work
          rather than per skill, so the number who have finished a whole skill can only be lower
          than its weakest piece — and a piece finished by fewer than {MIN_COHORT} students has its
          count withheld entirely. Either way the number of students behind a skill can only be
          higher than shown, never lower.
        </LText>
      </View>
    </InsightPanel>
  );
}

// --------------------------------------------------------------- 2. watch

function WatchPanel({ list }: { list: ReturnType<typeof studentsToWatch> }) {
  const styles = useInstructorStyles();
  const meaning = `Students who have never finished anything, or who were working and have cleared nothing for ${STALE_DAYS} days. How recently somebody worked is the earliest warning this data can give.`;

  return (
    <InsightPanel
      title="Who to check on"
      meaning={meaning}
      action={
        list.rows.length > 0
          ? 'Send one short message each. Name the work, not the person — ask what is in the way of the skill they stopped on, rather than telling them they are behind.'
          : undefined
      }
    >
      <DataTable
        columns={[
          { key: 'name', label: 'Student', flex: 3 },
          { key: 'what', label: 'What happened', flex: 3 },
          { key: 'when', label: 'Days since', num: true, flex: 2 },
        ]}
        rows={list.rows.map((row) => ({
          key: row.userId,
          label: `${row.displayName}. ${watchWords(row)}.`,
          cells: [row.displayName, watchWords(row), row.daysIdle === null ? '—' : String(row.daysIdle)],
        }))}
        empty={
          <LText variant="body" tone="muted">
            Everybody has started, and everybody has finished something in the last {STALE_DAYS}{' '}
            days. Nothing here needs chasing.
          </LText>
        }
      />
      <View style={styles.panelBody}>
        <LText variant="small" tone="muted" style={styles.prose}>
          {list.rankingSuppressed
            ? `This is a list of things that happened, not a judgement. Nobody appears on it for being slow. With fewer than ${MIN_COHORT} students there is no class to compare anyone against, so the comparison is not made at all.`
            : 'This is a list of things that happened, not a judgement. Nobody appears on it for being slow — being in the slower half while still working is not on this list. Somebody who has stopped may be ill, ahead elsewhere, or working on something with no skill attached.'}
        </LText>
      </View>
    </InsightPanel>
  );
}

function watchWords(row: WatchRow): string {
  if (row.reason === 'not-started') return 'Has not finished anything yet';
  return row.alsoBehind
    ? 'Stopped, and among the slowest quarter'
    : 'Was working, then stopped';
}

// -------------------------------------------------------------- 3. spread

function SpreadPanel({ result }: { result: ReturnType<typeof classSpread> }) {
  const styles = useInstructorStyles();
  const meaning =
    'Where the class sits, as a shape rather than one average. An average hides the class that has split in two: half finished and half not started still averages out to a comfortable middle.';

  if (result.suppressed) {
    return (
      <InsightPanel title="How far the class has got" meaning={meaning}>
        <Withheld reason={result.reason} />
      </InsightPanel>
    );
  }

  return (
    <InsightPanel
      title="How far the class has got"
      meaning={meaning}
      action={
        result.split
          ? 'This class has pulled into two groups with almost nobody in between. One pace cannot serve both — plan next week as two things, not one.'
          : `Half the class is past ${result.median}% of the course. The slowest quarter is at ${result.lower}% or below; the fastest at ${result.upper}% or above.`
      }
    >
      <View style={styles.panelBody}>
        {result.bands.map((band) => (
          <View key={band.key} style={styles.bandRow}>
            <LText variant="body" style={styles.bandLabel}>
              {band.label}
            </LText>
            <View style={styles.bandTrack}>
              <View
                style={[
                  styles.bandFill,
                  { width: `${Math.round((band.count / result.size) * 100)}%` },
                ]}
              />
            </View>
            <LText variant="body" numeric style={styles.bandCount}>
              {band.count} of {result.size}
            </LText>
          </View>
        ))}
        <LText variant="small" tone="muted" style={styles.prose}>
          Counts rather than percentages on purpose. With {result.size} students one person moving
          shifts a percentage by several points, and a figure that swings that far on one person&rsquo;s
          Tuesday is not telling you anything.
        </LText>
      </View>
    </InsightPanel>
  );
}

// -------------------------------------------------------------- 4. limits

/**
 * What the numbers above cannot see.
 *
 * Not a disclaimer. Instructors read these screens retrospectively and come away
 * unsure what to change, and the documented way that goes wrong is over-reading
 * a figure the data never supported. Saying the boundary out loud is cheaper
 * than an instructor discovering it after acting on it.
 */
function LimitsPanel() {
  const styles = useInstructorStyles();
  return (
    <InsightPanel
      title="What this page cannot see"
      meaning="Worth knowing before you act on anything above."
      action="Treat every panel as the start of a conversation with a student, not a verdict about one."
    >
      <View style={styles.panelBody}>
        <Limit>
          <LText variant="body" style={styles.prose}>
            <LText variant="body" style={styles.strong}>When</LText> anything was finished. A skill
            cleared in week two and one cleared yesterday look identical here, so nothing on this
            page can tell you what has been forgotten or what needs revisiting.
          </LText>
        </Limit>
        <Limit>
          <LText variant="body" style={styles.prose}>
            <LText variant="body" style={styles.strong}>Whether anyone is getting worse.</LText> These
            are today&rsquo;s figures with nothing to compare them to. A student sliding for three
            weeks and one who has always been where they are look the same.
          </LText>
        </Limit>
        <Limit>
          <LText variant="body" style={styles.prose}>
            <LText variant="body" style={styles.strong}>How hard anything was.</LText> Cardinal Skill
            records that a skill was finished, not how many attempts it took, so a skill everybody
            struggled through and one everybody breezed are the same number here.
          </LText>
        </Limit>
        <Limit>
          <LText variant="body" style={styles.prose}>
            <LText variant="body" style={styles.strong}>Why somebody stopped.</LText> Only that they
            did. Illness, a heavy week elsewhere, and giving up all read as the same silence.
          </LText>
        </Limit>
      </View>
    </InsightPanel>
  );
}

function Limit({ children }: { children: React.ReactNode }) {
  const styles = useInstructorStyles();
  return (
    <View style={styles.limitRow}>
      <Icon name="minus" size={16} tone="muted" />
      <View style={styles.rowStack}>{children}</View>
    </View>
  );
}

/** "1 student", "4 students" — plural agreement without a library. */
function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
// -------------------------------------------------------------------- import

/**
 * Importing a syllabus, instructor side.
 *
 * The parse itself is the same run the student check-in screen performs — one
 * module, `@/lib/syllabusImport`, so the two cannot drift. What differs is only
 * what happens once the course exists: a verified instructor's import is
 * published to the official catalog before the workspace moves on.
 *
 * Nothing here reports progress it has not seen. Each step is announced when it
 * actually starts, every failure says what to do next, and a course that parsed
 * is never thrown away because a later step failed.
 */

