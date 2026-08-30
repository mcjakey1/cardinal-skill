import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { STALE_DAYS } from '@/features/skilltree/cohort';
import {
  rosterFlag,
  sortRoster,
  type RosterEntry,
  type RosterView,
} from '@/features/skilltree/roster';
import {
  Badge,
  DataTable,
  LButton,
  LText,
  Meter,
  Notice,
  Panel,
  Segmented,
  Skeleton,
  type Column,
} from '@/ui/lms';
import {
  PageHead,
  fetchRoster,
  styles,
  type CourseRow,
} from './shared';

/**
 * Invented students, labelled as invented wherever they appear.
 *
 * The same rule the sample cohort follows: chosen to exercise the screen rather
 * than flatter it. One has cleared nothing, one has been idle past the stale
 * threshold, and one is finished — so both flags and their absence are visible
 * without a database.
 */
const SAMPLE_ROSTER: RosterEntry[] = [
  { userId: 's1', displayName: 'A. Reyes', email: 'a.reyes@example.edu', enrolled: true, mastered: 0, gradedNodes: 8, progress: 0, xp: 0, lastActive: null },
  { userId: 's2', displayName: 'B. Okafor', email: 'b.okafor@example.edu', enrolled: true, mastered: 1, gradedNodes: 8, progress: 13, xp: 50, lastActive: '2026-01-04T09:00:00.000Z' },
  { userId: 's3', displayName: 'C. Lindqvist', email: 'c.lindqvist@example.edu', enrolled: true, mastered: 3, gradedNodes: 8, progress: 38, xp: 140, lastActive: '2026-02-26T16:20:00.000Z' },
  { userId: 's4', displayName: 'D. Mwangi', email: 'd.mwangi@example.edu', enrolled: true, mastered: 5, gradedNodes: 8, progress: 63, xp: 260, lastActive: '2026-02-28T11:05:00.000Z' },
  { userId: 's5', displayName: 'E. Fontaine', email: 'e.fontaine@example.edu', enrolled: true, mastered: 6, gradedNodes: 8, progress: 75, xp: 320, lastActive: '2026-03-01T08:40:00.000Z' },
  { userId: 's6', displayName: 'F. Halvorsen', email: 'f.halvorsen@example.edu', enrolled: true, mastered: 8, gradedNodes: 8, progress: 100, xp: 480, lastActive: '2026-02-27T19:15:00.000Z' },
];

/**
 * An invented class, labelled as invented wherever it appears.
 *
 * Nobody can enrol on a course in this build, so every real course reads zero
 * students and the page an instructor opens is a page of empty states. This is
 * how the layout gets looked at at all.
 *
 * Chosen to exercise the rules rather than flatter them. The class has pulled
 * apart into a stuck group and a finished group, so the split warning fires; two
 * students have gone quiet and one never began; and "Sampling distributions" is
 * under the five-student floor, so its figure is withheld rather than drawn as a
 * zero. That withholding is the most important thing this screen does, and it
 * would be invisible in sample data where every row cleared the threshold.
 */

const ROSTER_COLUMNS: Column[] = [
  { key: 'student', label: 'Student', flex: 3 },
  { key: 'email', label: 'Email', flex: 3 },
  { key: 'cleared', label: 'Cleared', num: true, flex: 1.2 },
  { key: 'progress', label: 'Progress', flex: 2 },
  { key: 'xp', label: 'XP', num: true, flex: 1 },
  { key: 'seen', label: 'Last cleared', flex: 1.4 },
];

/**
 * The registered-accounts fallback shows no figures, and that is the point.
 *
 * Somebody who was never given the course has not scored zero — they were never
 * asked. Printing `0/8` and a flat progress bar next to their name would read as
 * a student who has done nothing, which is a different and unfair claim. Name,
 * address, and where they actually stand.
 */
const CONTACT_COLUMNS: Column[] = [
  { key: 'student', label: 'Student', flex: 3 },
  { key: 'email', label: 'Email', flex: 3 },
  { key: 'standing', label: 'On this course', flex: 2 },
];

const FLAG_LABEL = {
  'not-started': 'Nothing cleared yet',
  stale: `Nothing in ${STALE_DAYS} days`,
} as const;

/**
 * The roster.
 *
 * This is a per-student read, and it is the one screen in the app where a name
 * sits next to a record — so what it shows is bounded on purpose. A name, an
 * address to reach them at, progress through work the instructor set, and when
 * it last moved. No grades, because Cardinal Skill does not hold any; no pace or
 * effort estimate, because those are inferences about a person rather than facts
 * about their work.
 *
 * The address is new, and `0030_roster_contacts.sql` is where the case for it is
 * argued. Two things follow from that file and are enforced here rather than
 * left to the reader: a database without 0030 loses the column and not the
 * panel, and a row the database marked `enrolled: false` is a registered account
 * standing in for a roster, never a student on this course.
 */
export function Students({ course }: { course: CourseRow }) {
  const [sample, setSample] = useState(false);
  const [filter, setFilter] = useState<'all' | 'flagged'>('all');
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['instructor-roster', course.id],
    queryFn: () => fetchRoster(course.id),
  });

  // Read once per render rather than per row, so a list cannot flag one student
  // against a different clock than the one beside them.
  const now = new Date();
  const view: RosterView = sample
    ? { mode: 'enrolled', rows: SAMPLE_ROSTER }
    : data?.kind === 'ready'
      ? data.view
      : { mode: 'enrolled', rows: [] };
  // "Registered, not yet enrolled" is a different fact from "on this course",
  // and the screen never lets the two share a heading, a column set or a badge.
  const standIn = view.mode === 'registered';
  const rows = sortRoster(view.rows);
  const flagged = rows.filter((r) => rosterFlag(r, now) !== null);
  const shown = standIn || filter === 'all' ? rows : flagged;

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
        lede={
          standIn
            ? `Nobody is enrolled on ${course.title} yet, so this is everyone with a Cardinal Skill account, by name and email. It is a contact list, not a class list.`
            : `Everyone enrolled on ${course.title}, least far along first. Progress is how much of the graded tree a student has cleared — Cardinal Skill stores no grades, so there are none here to show.`
        }
      />

      {sample ? (
        <Notice tone="attention" title="Sample roster — these people do not exist">
          Six invented students, so the screen can be looked at without a database. No row below was
          read from anywhere, and no address below can be written to.
        </Notice>
      ) : null}

      {!sample && error ? (
        <>
          <Notice tone="error" title="The roster did not load">
            {`${error instanceof Error ? error.message : 'The roster could not be read.'}\n\nPress Try again. If it keeps failing, check that you are still signed in.`}
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

      {!sample && !error && data?.kind === 'example' ? (
        <>
          <Notice title="The example chart has no students">
            It is here so you can see how the workspace is laid out. To see a real roster, open
            Courses and choose one of your own.
          </Notice>
          {toggle}
        </>
      ) : null}

      {!sample && !error && data?.kind === 'not-owned' ? (
        <>
          <Notice tone="attention" title="This course belongs to someone else">
            Only the instructor who owns a course can see who is on it. Open Courses and choose one
            of your own.
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

      {!sample && standIn ? (
        <Notice tone="attention" title="Registered, not yet enrolled">
          These people have a Cardinal Skill account. None of them has been put on {course.title},
          so none of the work you set is theirs yet and no progress is shown. Adding students to a
          course is coming; until then this list is the same on every course you teach.
        </Notice>
      ) : null}

      {!sample && view.mode === 'no-contacts' ? (
        <Notice tone="attention" title="Email addresses are not available yet">
          Names and progress loaded, but this database has not had the roster update applied, so
          there are no addresses to show. Ask whoever manages your Cardinal Skill database to apply
          migration 0030.
        </Notice>
      ) : null}

      {rows.length > 0 ? (
        <>
          {standIn ? null : (
            <Segmented
              label="Filter the roster"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `Everyone (${rows.length})` },
                { value: 'flagged', label: `Worth a look (${flagged.length})` },
              ]}
            />
          )}

          <Panel>
            <DataTable
              columns={standIn ? CONTACT_COLUMNS : ROSTER_COLUMNS}
              rows={shown.map((r) => {
                const flag = rosterFlag(r, now);
                const who = (
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
                  </View>
                );
                // Selectable so an address can be copied out to write to. There
                // is no mail button here on purpose: this workspace does not
                // send anything on an instructor's behalf.
                const address = (
                  <LText
                    key="email"
                    variant="small"
                    tone={r.email ? 'ink' : 'muted'}
                    selectable={Boolean(r.email)}
                    numberOfLines={1}
                  >
                    {r.email || 'Not available'}
                  </LText>
                );

                return {
                  key: r.userId,
                  label: standIn
                    ? `${r.displayName}, ${r.email || 'no address'}, registered but not enrolled`
                    : `${r.displayName}, ${r.email || 'no address'}, ${r.progress}% cleared`,
                  cells: standIn
                    ? [
                        who,
                        address,
                        <Badge key="standing" label="Not enrolled" tone="attention" />,
                      ]
                    : [
                        who,
                        address,
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

      {!sample && !error && data?.kind === 'ready' && rows.length === 0 ? (
        <>
          <Notice title="Nobody is enrolled on this course yet">
            {view.mode === 'no-contacts'
              ? 'The roster fills as students join. Until then there is nothing to read, and nothing is put here to stand in for it.'
              : 'Nobody has registered a Cardinal Skill account to stand in for a roster either, so there is nothing to read and nothing is invented to fill it.'}
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

