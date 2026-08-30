import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AUDIT_GROUPS,
  EMPTY_AUDIT_FILTER,
  addableAccounts,
  adminActionMessage,
  appendAuditPage,
  auditCsv,
  auditCsvFilename,
  auditFilterActive,
  auditSummary,
  calendarDay,
  describeAuditAction,
  describeAuditFilter,
  adminCourseActions,
  adminUnlocked,
  lockAdmin,
  nextAuditCursor,
  unlockAdmin,
  type AuditEntry,
  type AuditFilter,
  type AuditSummaryLine,
} from '@/lib/admin';
import { saveCsv } from '@/lib/saveCsv';
import {
  fetchAccounts,
  fetchAllCourses,
  fetchAuditTrail,
  isAdministrator,
  setCoursePublication,
  setEnrollment,
  setInstructorVerification,
  type AdminAccount,
  type AdminCourse,
} from '@/lib/adminApi';
import { courseKindLabel, type CoursePublicationStatus } from '@/features/skilltree/courseDistribution';
import { findPeople, rosterFlag, sortRoster, type RosterEntry } from '@/features/skilltree/roster';
import { fetchRoster } from '@/ui/instructor/shared';
import { lms } from '@/theme/lms';
import {
  Badge,
  DataTable,
  Field,
  LButton,
  LModal,
  LText,
  Meter,
  Notice,
  Panel,
  PanelHead,
  Segmented,
  Skeleton,
} from '@/ui/lms';

/**
 * The admin area of the instructor workspace.
 *
 * The password in `src/lib/admin.ts` decides what this file SHOWS. It decides
 * nothing else, and the comment over that constant says why at length. The
 * server answer below is the one that matters: the same `administrators` table
 * every admin RPC re-checks in its own body, and every action here goes through
 * one of those RPCs rather than a table write of its own.
 *
 * Everything here draws in the LMS tokens, like the rest of `/instructor`.
 *
 * ONE POWER IS NOT ON THIS PAGE ON PURPOSE. "Edit any course" is not a second
 * editor built here. The workspace's own course query runs its rows through
 * `authorableCourses`, which keeps an instructor to what they wrote and hands an
 * administrator the whole site with `canEdit` on all of it — so the Courses tab
 * lists them and the Skill tree tab authors them with the editor that already
 * exists. A duplicate authoring surface for administrators is how two editors
 * drift apart.
 */

const STATUS_TONE: Record<CoursePublicationStatus, 'ok' | 'neutral' | 'attention'> = {
  published: 'ok',
  draft: 'neutral',
  archived: 'attention',
};

export interface AdminAreaProps {
  liveSession: boolean;
  /** The workspace's own selection, shared so a chart jump lands on this course. */
  courseId: string | null;
  onSelectCourse: (id: string) => void;
  /** Selects the course in the workspace and opens the Skill tree tab on it. */
  onOpenChart: (id: string) => void;
  /**
   * The same detour for a row about a person: the course's student list, which
   * is the nearest thing to that person the workspace has.
   */
  onOpenPerson: (courseId: string) => void;
}

export function AdminArea({
  liveSession,
  courseId,
  onSelectCourse,
  onOpenChart,
  onOpenPerson,
}: AdminAreaProps) {
  const [unlocked, setUnlocked] = useState(adminUnlocked);
  const [entry, setEntry] = useState('');
  const [wrong, setWrong] = useState(false);

  const submit = () => {
    if (unlockAdmin(entry)) {
      setUnlocked(true);
      setEntry('');
      setWrong(false);
      return;
    }
    setWrong(true);
  };

  return (
    <>
      <View style={styles.head}>
        <LText variant="page">Admin</LText>
        <LText variant="body" tone="muted" style={styles.prose}>
          {unlocked
            ? 'Every course on the site, who is on them, and who carries a verified badge.'
            : 'This area is for whoever looks after the whole site. It stays closed until the administrator password is typed in.'}
        </LText>
      </View>

      {unlocked ? (
        <Unlocked
          liveSession={liveSession}
          courseId={courseId}
          onSelectCourse={onSelectCourse}
          onOpenChart={onOpenChart}
          onOpenPerson={onOpenPerson}
          onLock={() => { lockAdmin(); setUnlocked(false); }}
        />
      ) : (
        <Panel>
          <PanelHead title="Administrator password" />
          <View style={styles.body}>
            <Field
              label="Password"
              value={entry}
              onChangeText={(next) => {
                setEntry(next);
                setWrong(false);
              }}
              onSubmitEditing={submit}
              returnKeyType="go"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Type the password"
              style={styles.input}
              error={wrong ? 'That password is not right. Check it and type it again.' : undefined}
              hint="If you do not have it, ask whoever set this site up. Nothing is hidden from you until then — this area is simply not yours."
            />
            <LButton
              label="Open the admin area"
              icon="unlock"
              variant="primary"
              onPress={submit}
              style={styles.tall}
            />
          </View>
        </Panel>
      )}
    </>
  );
}

function Unlocked({
  liveSession,
  courseId,
  onSelectCourse,
  onOpenChart,
  onOpenPerson,
  onLock,
}: AdminAreaProps & { onLock: () => void }) {
  const admin = useQuery({
    queryKey: ['is-administrator'],
    queryFn: isAdministrator,
    enabled: liveSession,
    // One try. A retried failure means half a minute of spinner in front of an
    // answer that would be "no" either way.
    retry: false,
  });
  const isAdmin = admin.data === true;

  return (
    <>
      <Panel>
        <PanelHead title="Is this account an administrator?" />
        <View style={styles.body}>
          {admin.isLoading ? (
            <Skeleton width="60%" />
          ) : (
            <Badge
              tone={isAdmin ? 'ok' : 'neutral'}
              icon={isAdmin ? 'check' : 'minus'}
              label={isAdmin ? 'Yes, on the server' : 'No, not on the server'}
            />
          )}

          <LText variant="small" style={styles.prose}>
            {isAdmin
              ? 'This account is listed in the site’s administrator record, so the actions below are yours to use.'
              : 'The password opened this page, and that is all it did. Being an administrator is a record the server keeps, and this account is not in it, so every action below would be refused.'}
          </LText>

          {!liveSession ? (
            <LText variant="small" tone="muted" style={styles.prose}>
              This is a local demo session, so there is no server to ask. Sign out and sign in with
              a real account to see the real answer.
            </LText>
          ) : admin.isError ? (
            <LText variant="small" tone="muted" style={styles.prose}>
              The server could not be reached just now, so this account is treated as not an
              administrator. Check your internet connection and open this page again.
            </LText>
          ) : null}
        </View>
      </Panel>

      {isAdmin ? (
        <>
          <Courses selected={courseId} onSelect={onSelectCourse} onOpenChart={onOpenChart} />
          <People courseId={courseId} />
          <Badges />
          <AuditLog onOpenChart={onOpenChart} onOpenPerson={onOpenPerson} />
        </>
      ) : (
        <Panel>
          <PanelHead title="What an administrator can do" />
          <View style={styles.body}>
            <Notice tone="attention" title="Nothing here would be allowed to this account">
              These actions are built and working. They are not drawn for an account the server does
              not list as an administrator, because a button that is certain to be refused is worse
              than no button.
            </Notice>
            <LText variant="small" style={styles.prose}>
              An administrator can edit and publish any course, archive one without losing a single
              student record, grant and revoke an instructor’s verified badge, put a student on a
              course or take them off, and read a named student’s progress on any course.
            </LText>
          </View>
        </Panel>
      )}

      <Panel>
        <PanelHead title="Close this area" />
        <View style={styles.body}>
          <LText variant="small" style={styles.prose}>
            Closing hides this page again until the password is typed in. It happens on its own
            whenever the app is reloaded, so nothing is left open on a shared computer.
          </LText>
          <View style={styles.row}>
            <LButton label="Close the admin area" icon="lock" onPress={onLock} style={styles.tall} />
          </View>
        </View>
      </Panel>
    </>
  );
}

// ------------------------------------------------------------------- courses

const COURSE_COLUMNS = [
  { key: 'title', label: 'Course', flex: 3 },
  { key: 'kind', label: 'Kind', flex: 1 },
  { key: 'status', label: 'In the catalog', flex: 1 },
];

function Courses({
  selected,
  onSelect,
  onOpenChart,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  onOpenChart: (id: string) => void;
}) {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState<CoursePublicationStatus | null>(null);

  const courses = useQuery({ queryKey: ['admin-courses'], queryFn: fetchAllCourses });
  const change = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CoursePublicationStatus }) =>
      setCoursePublication(id, status),
    onSuccess: () => {
      setConfirming(null);
      // The workspace's own course list reads the same rows and shows the same
      // publication badges, so it is stale the moment this succeeds.
      void client.invalidateQueries({ queryKey: ['admin-courses'] });
      void client.invalidateQueries({ queryKey: ['courses'] });
      void client.invalidateQueries({ queryKey: ['admin-audit'] });
    },
  });

  const rows = (courses.data ?? []).filter((course) =>
    course.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const course = (courses.data ?? []).find((row) => row.id === selected) ?? null;

  return (
    <>
      {/* The list and the course chosen from it are one act, so they sit side by
          side and the page stops growing downward as you click through courses.
          Narrow windows wrap them back into a column. */}
      <View style={styles.columns}>
        <Panel style={styles.listColumn}>
          <PanelHead
            title="Every course on the site"
            right={<Badge label={`${courses.data?.length ?? 0} in total`} />}
          />
          <View style={styles.body}>
            <LText variant="small" tone="muted" style={styles.prose}>
              Not only your own. Choose one to act on it. Editing a course is the Courses and Skill
              tree tabs, which now list every course for this account.
            </LText>

            <Field
              label="Find a course"
              value={search}
              onChangeText={setSearch}
              placeholder="Type part of the title"
              autoCapitalize="none"
              style={styles.input}
            />

            {courses.isPending ? (
              <>
                <Skeleton width="70%" />
                <Skeleton width="55%" />
              </>
            ) : courses.error ? (
              <Notice tone="error" title="The course list did not load">
                {adminActionMessage(courses.error)}
              </Notice>
            ) : (
              <DataTable
                columns={COURSE_COLUMNS}
                rows={rows.map((row) => adminCourseRow(row, row.id === selected, () => onSelect(row.id)))}
                empty={
                  <LText variant="small" tone="muted">
                    No course matches that.
                  </LText>
                }
              />
            )}
          </View>
        </Panel>

        {course ? (
          <Panel style={styles.detailColumn}>
            <PanelHead
              title={course.title}
              right={<Badge tone={STATUS_TONE[course.publicationStatus]} label={course.publicationStatus} />}
            />
            <View style={styles.body}>
              {/* Before the actions, not after. Archiving the wrong course is the
                  mistake this panel is most able to cause, and a title is a weak
                  way to tell two charts apart. */}
              <View style={styles.action}>
                <View style={styles.actionText}>
                  <LText variant="small" style={styles.strong}>
                    Look at the chart first
                  </LText>
                  <LText variant="small" tone="muted" style={styles.prose}>
                    Opens this course in the Skill tree tab, so you can see what is in it before you
                    take it out of the catalog. Come back to Admin when you have.
                  </LText>
                </View>
                <LButton
                  label="Open this chart"
                  icon="git-branch"
                  style={styles.tall}
                  onPress={() => onOpenChart(course.id)}
                />
              </View>

              <CourseActions
                course={course}
                pending={change.isPending}
                onChoose={setConfirming}
              />
              {change.error ? (
                <Notice tone="error" title="That did not go through">
                  {adminActionMessage(change.error)}
                </Notice>
              ) : null}
            </View>
          </Panel>
        ) : null}
      </View>

      <LModal
        visible={confirming !== null}
        title={confirming === 'archived' ? 'Archive this course?' : 'Change this course?'}
        onRequestClose={() => setConfirming(null)}
      >
        <View style={styles.body}>
          <LText variant="small" style={styles.prose}>
            {confirming === 'archived'
              ? `Archiving ${course?.title ?? 'this course'} takes it out of the catalog. Every student record on it stays exactly as it is — nothing is deleted, and publishing it again brings it back with its class intact.`
              : confirming === 'draft'
                ? `Unpublishing ${course?.title ?? 'this course'} takes it out of the catalog and hands it back to its owner as a draft. Its share link stops working. Student records are untouched.`
                : `Publishing ${course?.title ?? 'this course'} puts it in the catalog, where any student can find and join it.`}
          </LText>
          <View style={styles.row}>
            <LButton
              label={confirming === 'archived' ? 'Archive it' : 'Do it'}
              variant={confirming === 'archived' ? 'danger' : 'primary'}
              disabled={change.isPending}
              style={styles.tall}
              onPress={() => {
                if (course && confirming) change.mutate({ id: course.id, status: confirming });
              }}
            />
            <LButton
              label="Cancel"
              variant="quiet"
              disabled={change.isPending}
              style={styles.tall}
              onPress={() => setConfirming(null)}
            />
          </View>
        </View>
      </LModal>
    </>
  );
}

function adminCourseRow(course: AdminCourse, active: boolean, onPress: () => void) {
  return {
    key: course.id,
    active,
    onPress,
    label: `${course.title}, ${courseKindLabel(course.kind)}, ${course.publicationStatus}`,
    cells: [
      <View key="title" style={styles.rowStack}>
        <LText variant="small" style={styles.strong} numberOfLines={1}>
          {course.title}
        </LText>
        <LText variant="micro" tone="muted" numberOfLines={1}>
          {course.own ? 'Yours' : 'Someone else’s'}
          {course.term ? ` · ${course.term}` : ''}
        </LText>
      </View>,
      <Badge key="kind" label={courseKindLabel(course.kind)} />,
      <Badge
        key="status"
        tone={STATUS_TONE[course.publicationStatus]}
        label={course.publicationStatus}
      />,
    ],
  };
}

function CourseActions({
  course,
  pending,
  onChoose,
}: {
  course: AdminCourse;
  pending: boolean;
  onChoose: (status: CoursePublicationStatus) => void;
}) {
  const { actions, blocked } = adminCourseActions(course);

  if (blocked) {
    return (
      <Notice title="Nothing to publish">
        {blocked} There is no catalog entry to take away and no class to protect.
      </Notice>
    );
  }

  return (
    <>
      {actions.map((action) => (
        <View key={action.status} style={styles.action}>
          <View style={styles.actionText}>
            <LText variant="small" style={styles.strong}>
              {action.label}
            </LText>
            <LText variant="small" tone="muted" style={styles.prose}>
              {action.hint}
            </LText>
          </View>
          <LButton
            label={action.label}
            variant={action.status === 'archived' ? 'danger' : 'default'}
            disabled={pending}
            style={styles.tall}
            onPress={() => onChoose(action.status)}
          />
        </View>
      ))}
    </>
  );
}

// -------------------------------------------------------------------- people

const ADD_COLUMNS = [
  { key: 'who', label: 'Account', flex: 3 },
  { key: 'act', label: '', flex: 2 },
];

const PEOPLE_COLUMNS = [
  { key: 'who', label: 'Student', flex: 3 },
  { key: 'progress', label: 'Progress', flex: 2 },
  { key: 'xp', label: 'XP', num: true, flex: 1 },
  { key: 'act', label: 'On the course', flex: 1 },
];

function People({ courseId }: { courseId: string | null }) {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'on' | 'add'>('on');

  // The account directory, and the reason it is a second read. `course_roster`
  // answers "who is on this course" OR "who exists", never both: 0030 returns
  // the enrolled students as soon as anybody is enrolled, so the people you
  // would want to add disappear from it the moment the first one joins. Adding
  // somebody needs a list that does not narrow like that.
  const accounts = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: fetchAccounts,
    enabled: Boolean(courseId),
  });

  const roster = useQuery({
    queryKey: ['admin-roster', courseId],
    queryFn: () => fetchRoster(courseId!),
    enabled: Boolean(courseId),
  });
  const enrol = useMutation({
    mutationFn: ({ userId, enrolled }: { userId: string; enrolled: boolean }) =>
      setEnrollment(courseId!, userId, enrolled),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin-roster', courseId] });
      // The Students tab reads the same two functions under its own key.
      void client.invalidateQueries({ queryKey: ['instructor-roster', courseId] });
      void client.invalidateQueries({ queryKey: ['admin-audit'] });
    },
  });

  if (!courseId) {
    return (
      <Panel>
        <PanelHead title="People on a course" />
        <View style={styles.body}>
          <Notice title="Choose a course first">
            Adding a student, removing one, and reading a named student’s progress all happen on a
            particular course. Pick one above.
          </Notice>
        </View>
      </Panel>
    );
  }

  const view = roster.data?.kind === 'ready' ? roster.data.view : null;
  const rows = view ? sortRoster(view.rows) : [];
  const addable = addableAccounts(accounts.data ?? [], rows);
  const shown = findPeople(search, mode === 'on' ? rows.filter((r) => r.enrolled) : []);
  const shownAccounts = findPeople(search, addable);
  const now = new Date();

  return (
    <Panel>
      <PanelHead
        title="People on this course"
        right={view ? <Badge label={`${rows.filter((r) => r.enrolled).length} enrolled`} /> : undefined}
      />
      <View style={styles.body}>
        <LText variant="small" tone="muted" style={styles.prose}>
          Search by name or address to read one student’s progress. Removing someone takes their
          access to the course and leaves every record they earned on it.
        </LText>

        <Segmented
          label="Who to show"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'on', label: `On the course (${rows.filter((r) => r.enrolled).length})` },
            { value: 'add', label: `Add someone (${addable.length})` },
          ]}
        />

        <Field
          label={mode === 'on' ? 'Find a student by name' : 'Find an account to add'}
          value={search}
          onChangeText={setSearch}
          placeholder={mode === 'on' ? 'Type a name or an address' : 'Type a name'}
          autoCapitalize="none"
          style={styles.input}
        />

        {roster.isPending ? (
          <>
            <Skeleton width="65%" />
            <Skeleton width="50%" />
          </>
        ) : roster.error ? (
          <Notice tone="error" title="The roster did not load">
            {adminActionMessage(roster.error)}
          </Notice>
        ) : roster.data?.kind === 'example' ? (
          <Notice title="The example chart has no students">
            It is a fixture rather than a row in the database. Choose a real course.
          </Notice>
        ) : roster.data?.kind === 'no-session' ? (
          <Notice tone="attention" title="Sign-in needed">
            A roster is only ever returned to a signed-in account.
          </Notice>
        ) : roster.data?.kind === 'not-owned' ? (
          <Notice tone="attention" title="The server refused this roster">
            An administrator may read any roster, so this account is not being treated as one.
          </Notice>
        ) : (
          <>
            {view?.mode === 'registered' ? (
              <Notice tone="attention" title="Nobody is enrolled on this course yet">
                These are registered accounts, not this course’s class. Adding one puts them on the
                course for real, and the list then narrows to the people who are on it.
              </Notice>
            ) : null}

            {enrol.error ? (
              <Notice tone="error" title="That did not go through">
                {adminActionMessage(enrol.error)}
              </Notice>
            ) : null}

            {mode === 'on' ? (
              <DataTable
                columns={PEOPLE_COLUMNS}
                rows={shown.map((person) =>
                  personRow(person, now, enrol.isPending, (enrolled) =>
                    enrol.mutate({ userId: person.userId, enrolled }),
                  ),
                )}
                empty={
                  <LText variant="small" tone="muted">
                    {search.trim()
                      ? 'Nobody on this course by that name.'
                      : 'Nobody is on this course yet. Add someone.'}
                  </LText>
                }
              />
            ) : accounts.isPending ? (
              <Skeleton width="55%" />
            ) : accounts.error ? (
              <Notice tone="error" title="The account list did not load">
                {adminActionMessage(accounts.error)}
              </Notice>
            ) : (
              <DataTable
                columns={ADD_COLUMNS}
                rows={shownAccounts.map((account) => ({
                  key: account.userId,
                  label: `${account.displayName}, not on this course`,
                  cells: [
                    <LText key="who" variant="small" style={styles.strong} numberOfLines={1}>
                      {account.displayName}
                    </LText>,
                    <LButton
                      key="act"
                      size="sm"
                      label="Add to the course"
                      icon="user-plus"
                      disabled={enrol.isPending}
                      onPress={() => enrol.mutate({ userId: account.userId, enrolled: true })}
                    />,
                  ],
                }))}
                caption="Every account on the site that is not already on this course. Names come from profiles, which hold no address."
                empty={
                  <LText variant="small" tone="muted">
                    {search.trim() ? 'No account by that name.' : 'Everybody is already on this course.'}
                  </LText>
                }
              />
            )}
          </>
        )}
      </View>
    </Panel>
  );
}

function personRow(
  person: RosterEntry,
  now: Date,
  pending: boolean,
  onSet: (enrolled: boolean) => void,
) {
  const flag = rosterFlag(person, now);
  return {
    key: person.userId,
    label: `${person.displayName}, ${person.progress}% of the graded tree`,
    cells: [
      <View key="who" style={styles.rowStack}>
        <LText variant="small" style={styles.strong} numberOfLines={1}>
          {person.displayName}
        </LText>
        {person.email ? (
          <LText variant="micro" tone="muted" numberOfLines={1}>
            {person.email}
          </LText>
        ) : null}
        {flag ? (
          <Badge tone="attention" label={flag === 'not-started' ? 'Nothing cleared yet' : 'Gone quiet'} />
        ) : null}
      </View>,
      // Progress is only a statement about somebody who was given the course.
      person.enrolled ? (
        <Meter key="progress" percent={person.progress} label={`${person.mastered}/${person.gradedNodes}`} />
      ) : (
        <LText key="progress" variant="micro" tone="muted">
          Not on this course
        </LText>
      ),
      <LText key="xp" variant="small">
        {person.enrolled ? person.xp : '—'}
      </LText>,
      <LButton
        key="act"
        size="sm"
        label={person.enrolled ? 'Remove' : 'Add'}
        icon={person.enrolled ? 'user-minus' : 'user-plus'}
        variant={person.enrolled ? 'danger' : 'default'}
        disabled={pending}
        onPress={() => onSet(!person.enrolled)}
      />,
    ],
  };
}

// -------------------------------------------------------------------- badges

const BADGE_COLUMNS = [
  { key: 'who', label: 'Account', flex: 3 },
  { key: 'badge', label: 'Verified instructor', flex: 2 },
];

function Badges() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');

  const accounts = useQuery({ queryKey: ['admin-accounts'], queryFn: fetchAccounts });

  const verify = useMutation({
    mutationFn: ({ userId, verified }: { userId: string; verified: boolean }) =>
      setInstructorVerification(userId, verified),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin-accounts'] });
      void client.invalidateQueries({ queryKey: ['admin-audit'] });
    },
  });

  const rows = findPeople(search, accounts.data ?? []);
  // One null means the whole read is blind, not that one account is unknown.
  const unreadable = (accounts.data ?? []).some((row) => row.verified === null);

  return (
    <Panel>
      <PanelHead title="Verified instructor badges" />
      <View style={styles.body}>
        <LText variant="small" tone="muted" style={styles.prose}>
          A verified instructor may publish an official course to every student. Revoking is
          permanent in one direction: the account cannot verify itself again by re-registering.
        </LText>

        <Field
          label="Find an account"
          value={search}
          onChangeText={setSearch}
          placeholder="Type a name"
          autoCapitalize="none"
          style={styles.input}
        />

        {unreadable ? (
          <Notice tone="attention" title="The current badges cannot be read on this database">
            Granting and revoking still work. Showing which accounts already hold a badge needs
            migration 0034, which has not been applied here — so no badge state is drawn rather
            than every account being drawn as unverified.
          </Notice>
        ) : null}

        {verify.error ? (
          <Notice tone="error" title="That did not go through">
            {adminActionMessage(verify.error)}
          </Notice>
        ) : null}

        {accounts.isPending ? (
          <>
            <Skeleton width="60%" />
            <Skeleton width="45%" />
          </>
        ) : accounts.error ? (
          <Notice tone="error" title="The account list did not load">
            {adminActionMessage(accounts.error)}
          </Notice>
        ) : (
          <DataTable
            columns={BADGE_COLUMNS}
            rows={rows.map((account) =>
              badgeRow(account, verify.isPending, (verified) =>
                verify.mutate({ userId: account.userId, verified }),
              ),
            )}
            empty={
              <LText variant="small" tone="muted">
                {search.trim() ? 'No account by that name.' : 'No accounts to show.'}
              </LText>
            }
          />
        )}
      </View>
    </Panel>
  );
}

function badgeRow(account: AdminAccount, pending: boolean, onSet: (verified: boolean) => void) {
  return {
    key: account.userId,
    label: `${account.displayName}, ${account.verified ? 'verified' : 'not verified'}`,
    cells: [
      <LText key="who" variant="small" style={styles.strong} numberOfLines={1}>
        {account.displayName}
      </LText>,
      <View key="badge" style={styles.rowInline}>
        {account.verified === null ? null : (
          <Badge
            tone={account.verified ? 'gold' : 'neutral'}
            icon={account.verified ? 'award' : 'minus'}
            label={account.verified ? 'Verified' : 'Not verified'}
          />
        )}
        <LButton
          size="sm"
          label={account.verified ? 'Revoke' : 'Verify'}
          variant={account.verified ? 'danger' : 'default'}
          disabled={pending}
          onPress={() => onSet(!account.verified)}
        />
      </View>,
    ],
  };
}

// ----------------------------------------------------------------- audit log

const AUDIT_COLUMNS = [
  { key: 'when', label: 'When', flex: 2 },
  // Not "Administrator" any more. Since 0037 an instructor's own work is in
  // here too, and a column head naming only one of the two would file every
  // owner row as an administrator's.
  { key: 'who', label: 'Who', flex: 2 },
  { key: 'role', label: 'Acting as', flex: 1 },
  { key: 'what', label: 'What they did', flex: 4 },
];

/** How far back the strip counts, and what it calls that window. */
const SUMMARY_DAYS = 7;

/** One page. The server clamps anything larger, so this is the real ceiling. */
const AUDIT_PAGE = 100;

/**
 * The most the strip will count, and the server's own clamp (0039).
 *
 * The strip asks its own question of the record rather than counting the page
 * on screen. Counting `loaded` under-reported in direct proportion to how busy
 * the week had been — measured at `1 courses` against a true `12`, and the
 * twelve were the rows worth finding. A warning light that dims as the fire
 * grows is worse than no warning light.
 */
const SUMMARY_LIMIT = 500;

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
] as const;

type RangeChoice = (typeof RANGES)[number]['value'];

/**
 * What has been done to the site, newest first.
 *
 * Last on the page on purpose: it is the record of the actions above it, and an
 * administrator arrives here to act rather than to read. The actor gets a column
 * of their own rather than a place in the sentence — repeating the name inside
 * every line reads as an accusation instead of a record.
 *
 * EVERY NARROWING IS THE SERVER'S. The filter goes into the query rather than
 * across the rows that came back, so "nothing matches" means nothing in the
 * record matches, not nothing in the hundred rows already loaded. That
 * distinction is the whole reason this screen can be trusted, and
 * `auditQueryParams` is where it is kept.
 */
function AuditLog({
  onOpenChart,
  onOpenPerson,
}: {
  onOpenChart: (id: string) => void;
  onOpenPerson: (courseId: string) => void;
}) {
  const [filter, setFilter] = useState<AuditFilter>(EMPTY_AUDIT_FILTER);
  const [range, setRange] = useState<RangeChoice>('all');
  const [actorSearch, setActorSearch] = useState('');
  // Older pages already fetched, kept as pages rather than as one list: whether
  // there is more to ask for is a fact about the LAST page's length, and a
  // flattened list cannot answer it once a short page has been appended to a
  // full one. Changing a filter empties this, so the record starts again rather
  // than mixing two answers into one list.
  const [pages, setPages] = useState<AuditEntry[][]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);
  // What is typed in the two date boxes, which is not the same thing as what is
  // being filtered on. "2026-0" is a person half way through a date, not a
  // request; only a whole, real day reaches `filter` and therefore the server.
  const [dateText, setDateText] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const trail = useQuery({
    // The filter is in the key, so a narrowed record is its own cache entry and
    // going back to an earlier filter does not refetch what is already held.
    queryKey: ['admin-audit', filter],
    queryFn: () => fetchAuditTrail(filter, null, AUDIT_PAGE),
  });
  const accounts = useQuery({ queryKey: ['admin-accounts'], queryFn: fetchAccounts });

  // Deliberately not narrowed by `filter`: "is anything unusual happening" is a
  // question about the record, not about whatever slice is on screen. Its own
  // cache key, so filtering the table below does not refetch it.
  const recent = useQuery({
    // Nested under the same first key the other panels already invalidate, so a
    // publication or an enrolment refreshes the strip without three more call
    // sites having to remember it exists.
    queryKey: ['admin-audit', 'recent', SUMMARY_DAYS],
    queryFn: () =>
      fetchAuditTrail(
        { ...EMPTY_AUDIT_FILTER, from: isoDay(daysAgo(SUMMARY_DAYS)) },
        null,
        SUMMARY_LIMIT,
      ),
  });

  const first = trail.data ?? [];
  const loaded = pages.reduce<AuditEntry[]>(
    (soFar, page) => appendAuditPage(soFar, page),
    first,
  );
  const cursor = nextAuditCursor(pages[pages.length - 1] ?? first, AUDIT_PAGE);
  const active = auditFilterActive(filter);
  const narrowing = describeAuditFilter(
    filter,
    accounts.data?.find((account) => account.userId === filter.actorId)?.displayName ?? null,
  );
  const recentRows = recent.data ?? [];
  const summary = auditSummary(recentRows, daysAgo(SUMMARY_DAYS));
  // The server refuses more than 500 in one call, so a busier week than that is
  // counted short. Said out loud rather than rounded down silently.
  const summaryCapped = recentRows.length >= SUMMARY_LIMIT;

  /** Any change to what is being asked starts the record again. */
  const narrow = (next: AuditFilter) => {
    setFilter(next);
    setPages([]);
    setMoreError(null);
  };

  const chooseRange = (next: RangeChoice) => {
    setRange(next);
    // Entering Custom shows what is already applied. Leaving the boxes empty
    // under a live 30-day bound would have the fields disagree with the panel
    // head, and the head is the one telling the truth.
    if (next === 'custom') {
      setDateText({ from: filter.from ?? '', to: filter.to ?? '' });
      return;
    }
    setDateText({ from: '', to: '' });
    narrow({
      ...filter,
      from: next === 'all' ? null : isoDay(daysAgo(Number(next))),
      to: null,
    });
  };

  /**
   * Typing is not asking. The box keeps whatever was typed, and the query only
   * moves when that is a whole day or the box has been emptied — so the panel
   * no longer errors on nine of the ten keystrokes it takes to write one date,
   * and no longer fires an RPC for each of them.
   */
  const typeDate = (which: 'from' | 'to', text: string) => {
    setDateText({ ...dateText, [which]: text });
    const day = calendarDay(text);
    if (day !== null || text.trim() === '') narrow({ ...filter, [which]: day });
  };

  const showMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchAuditTrail(filter, cursor, AUDIT_PAGE);
      setPages([...pages, page]);
    } catch (error) {
      setMoreError(error);
    } finally {
      setLoadingMore(false);
    }
  };

  const exportCsv = () => {
    const now = new Date();
    void saveCsv(auditCsvFilename(filter, now), auditCsv(loaded, narrowing, now));
  };

  return (
    <Panel>
      <PanelHead
        title="What has been done to this site"
        right={
          <View style={styles.rowInline}>
            <Badge label={`${loaded.length} shown`} />
            {narrowing ? <Badge tone="attention" icon="filter" label={narrowing} /> : null}
          </View>
        }
      />
      <View style={styles.body}>
        {/* This paragraph's job is to stop a reader treating an absent row as
            proof that nothing happened. The migrations name every gap in their
            own headers; the screen has to be as careful as the SQL. */}
        <LText variant="small" tone="muted" style={styles.prose}>
          Course creations, publications, archives and deletions; chart and mission changes; and
          people put on or taken off a course by somebody other than themselves. Written by the
          server as each action happens, and not editable from here.
        </LText>
        <LText variant="small" tone="muted" style={styles.prose}>
          It does not record students joining or leaving a course on their own, an instructor
          renaming or editing their own course, a chart publish that changed nothing, or edits made
          straight to the underlying tables.
        </LText>

        <RecentActivity
          lines={summary}
          loading={recent.isPending}
          failed={recent.isError}
          capped={summaryCapped}
        />

        <AuditFilters
          filter={filter}
          range={range}
          actorSearch={actorSearch}
          dateText={dateText}
          accounts={accounts.data ?? []}
          onNarrow={narrow}
          onRange={chooseRange}
          onActorSearch={setActorSearch}
          onTypeDate={typeDate}
        />

        {trail.isPending ? (
          <>
            <Skeleton width="70%" />
            <Skeleton width="55%" />
          </>
        ) : trail.error ? (
          <Notice tone="error" title="The audit log did not load">
            {adminActionMessage(trail.error)}
          </Notice>
        ) : (
          <>
            <DataTable
              columns={AUDIT_COLUMNS}
              rows={loaded.map((entry) => auditRow(entry, onOpenChart, onOpenPerson, narrow, filter))}
              empty={
                <LText variant="small" tone="muted">
                  {active
                    ? 'Nothing in the record matches these filters.'
                    : 'Nothing yet. Actions taken on this site will appear here.'}
                </LText>
              }
            />

            {moreError ? (
              <Notice tone="error" title="The next page did not load">
                {adminActionMessage(moreError)}
              </Notice>
            ) : null}

            <View style={styles.row}>
              {/* Hidden rather than disabled once the record runs out, the same
                  rule the rest of this page keeps about controls certain to be
                  refused. */}
              {cursor ? (
                <LButton
                  label={loadingMore ? 'Loading…' : `Show ${AUDIT_PAGE} more`}
                  icon="chevron-down"
                  disabled={loadingMore}
                  style={styles.tall}
                  onPress={() => void showMore()}
                />
              ) : null}
              {loaded.length > 0 ? (
                <LButton
                  label="Export CSV"
                  icon="download"
                  style={styles.tall}
                  onPress={exportCsv}
                  accessibilityHint={
                    active
                      ? 'Saves the rows shown here, which are filtered. It does not save the whole record.'
                      : 'Saves the rows loaded here. Load more first if you need the rest of the record.'
                  }
                />
              ) : null}
              {active ? (
                <LButton
                  label="Clear filters"
                  variant="quiet"
                  icon="x"
                  style={styles.tall}
                  onPress={() => {
                    setRange('all');
                    setActorSearch('');
                    setDateText({ from: '', to: '' });
                    narrow(EMPTY_AUDIT_FILTER);
                  }}
                />
              ) : null}
            </View>
          </>
        )}
      </View>
    </Panel>
  );
}

/**
 * How much of each kind happened this week.
 *
 * The answer to "is anything unusual going on", which is the question somebody
 * opens this panel with. Without it the log only helps once you already suspect
 * something.
 */
function RecentActivity({
  lines,
  loading,
  failed,
  capped,
}: {
  lines: AuditSummaryLine[];
  loading: boolean;
  failed: boolean;
  capped: boolean;
}) {
  if (loading) return <Skeleton width="40%" />;

  // Never "nothing happened" when the truth is "nobody managed to ask". Those
  // two read identically to a reader and mean opposite things.
  if (failed) {
    return (
      <LText variant="small" tone="attention">
        The last {SUMMARY_DAYS} days could not be counted just now.
      </LText>
    );
  }

  return (
    <View style={styles.rowInline}>
      {lines.length === 0 ? (
        <LText variant="small" tone="muted">
          Nothing in the last {SUMMARY_DAYS} days.
        </LText>
      ) : (
        <>
          {lines.map((line) => (
            <Badge
              key={line.group}
              label={`${line.count}${capped ? '+' : ''} ${line.label.toLowerCase()}`}
            />
          ))}
          <LText variant="micro" tone="muted">
            {capped
              ? `in the last ${SUMMARY_DAYS} days, counted up to the first ${SUMMARY_LIMIT}`
              : `in the last ${SUMMARY_DAYS} days, across the whole record`}
          </LText>
        </>
      )}
    </View>
  );
}

function AuditFilters({
  filter,
  range,
  actorSearch,
  dateText,
  accounts,
  onNarrow,
  onRange,
  onActorSearch,
  onTypeDate,
}: {
  filter: AuditFilter;
  range: RangeChoice;
  actorSearch: string;
  dateText: { from: string; to: string };
  accounts: AdminAccount[];
  onNarrow: (next: AuditFilter) => void;
  onRange: (next: RangeChoice) => void;
  onActorSearch: (next: string) => void;
  onTypeDate: (which: 'from' | 'to', text: string) => void;
}) {
  const actor = accounts.find((account) => account.userId === filter.actorId) ?? null;

  return (
    <>
      <Field
        label="Search names and courses"
        value={filter.search}
        onChangeText={(search) => onNarrow({ ...filter, search })}
        placeholder="Type a person or a course"
        autoCapitalize="none"
        style={styles.input}
        hint="Searches the whole record on the server, not only the rows below."
      />

      {/* Colour and the pressed-in bevel together, never colour alone. */}
      <View style={styles.rowInline}>
        {AUDIT_GROUPS.map((group) => {
          const on = filter.groups.includes(group.group);
          return (
            <LButton
              key={group.group}
              size="sm"
              label={group.label}
              variant={on ? 'primary' : 'default'}
              accessibilityState={{ selected: on }}
              onPress={() =>
                onNarrow({
                  ...filter,
                  groups: on
                    ? filter.groups.filter((g) => g !== group.group)
                    : [...filter.groups, group.group],
                })
              }
            />
          );
        })}
      </View>

      <Segmented
        label="How far back"
        value={range}
        onChange={onRange}
        options={RANGES.map((option) => ({ value: option.value, label: option.label }))}
      />

      {range === 'custom' ? (
        <View style={styles.rowInline}>
          <Field
            label="From"
            value={dateText.from}
            onChangeText={(text) => onTypeDate('from', text)}
            placeholder="2026-09-01"
            autoCapitalize="none"
            style={styles.input}
            hint="Year first, like 2026-09-01."
          />
          <Field
            label="To"
            value={dateText.to}
            onChangeText={(text) => onTypeDate('to', text)}
            placeholder="2026-09-15"
            autoCapitalize="none"
            style={styles.input}
            hint="Year first, like 2026-09-15. Both days are included."
          />
        </View>
      ) : null}

      {actor ? (
        <View style={styles.rowInline}>
          <Badge icon="user" label={`Only ${actor.displayName}`} />
          <LButton
            size="sm"
            label="Anyone"
            variant="quiet"
            onPress={() => onNarrow({ ...filter, actorId: null })}
          />
        </View>
      ) : (
        <Field
          label="Filter by who did it"
          value={actorSearch}
          onChangeText={onActorSearch}
          placeholder="Type a name"
          autoCapitalize="none"
          style={styles.input}
        />
      )}

      {!actor && actorSearch.trim() ? (
        <View style={styles.rowInline}>
          {findPeople(actorSearch, accounts).slice(0, 6).map((account) => (
            <LButton
              key={account.userId}
              size="sm"
              label={account.displayName}
              onPress={() => onNarrow({ ...filter, actorId: account.userId })}
            />
          ))}
        </View>
      ) : null}

      {filter.subjectLabel ? (
        <View style={styles.rowInline}>
          {/* "Only Maria Sanchez" reads as what she did; it means what was done
              to her. A control carrying a person's name that shows half of what
              they appear in has to say which half. A course cannot act, so the
              course wording stays as it is. */}
          <Badge
            icon="crosshair"
            label={
              filter.subjectUserId
                ? `What was done to ${filter.subjectLabel}`
                : `Only ${filter.subjectLabel}`
            }
          />
          <LButton
            size="sm"
            label="Everything"
            variant="quiet"
            onPress={() =>
              onNarrow({
                ...filter,
                subjectUserId: null,
                subjectCourseId: null,
                subjectLabel: null,
              })
            }
          />
        </View>
      ) : null}
    </>
  );
}

/**
 * One row, and where it goes when pressed.
 *
 * A row about a course opens that chart; a row about a person opens that
 * course's student list, which is the nearest thing to the person that exists —
 * `Students` has no name search, so this lands the reader on the right roster
 * rather than the right row. A row with neither is not pressable: a row that
 * looks pressable and does nothing is worse than one that plainly does not.
 */
function auditRow(
  entry: AuditEntry,
  onOpenChart: (id: string) => void,
  onOpenPerson: (courseId: string) => void,
  onNarrow: (next: AuditFilter) => void,
  filter: AuditFilter,
) {
  const sentence = describeAuditAction(entry);
  const courseId = entry.subjectCourseId;
  const goesTo = courseId === null
    ? null
    : entry.subjectUserId !== null
      ? {
          press: () => onOpenPerson(courseId),
          label: `Open the students on ${entry.courseTitle ?? 'that course'}`,
        }
      : {
          press: () => onOpenChart(courseId),
          label: `Open ${entry.courseTitle ?? 'that chart'}`,
        };

  // The row carries no `onPress` of its own, and that is the point rather than
  // an omission. A pressable row is a `button` on web, and the two controls
  // below are buttons too — nesting them is invalid, and a browser handed one
  // control inside another cannot say which the reader meant. `badgeRow` states
  // its actions the same way. The cost is that the whole row is no longer a
  // click target; the gain is two controls that name what they each do.
  return {
    key: entry.id,
    label: `${auditWhen(entry.at)}. ${entry.actorName}, ${entry.actorRole}. ${sentence}.`,
    cells: [
      <LText key="when" variant="micro" tone="muted">
        {auditWhen(entry.at)}
      </LText>,
      <LText key="who" variant="small" style={styles.strong} numberOfLines={1}>
        {entry.actorName}
      </LText>,
      // Attention, not neutral: reaching into somebody else's course is the row
      // a reader should stop on. The word carries it as well as the tone.
      <Badge
        key="role"
        tone={entry.actorRole === 'owner' ? 'neutral' : 'attention'}
        label={entry.actorRole === 'owner' ? 'Owner' : 'Administrator'}
      />,
      <View key="what" style={styles.rowStack}>
        <LText variant="small">{sentence}</LText>
        <View style={styles.rowActions}>
          {goesTo ? (
            <LButton size="sm" variant="quiet" label={goesTo.label} onPress={goesTo.press} />
          ) : null}
          {entry.subjectCourseId || entry.subjectUserId ? (
            <LButton
              size="sm"
              variant="quiet"
              label={entry.subjectUserId ? 'What was done to this person' : 'Only this course'}
              onPress={() =>
                onNarrow({
                  ...filter,
                  subjectUserId: entry.subjectUserId,
                  subjectCourseId: entry.subjectUserId ? null : entry.subjectCourseId,
                  subjectLabel: entry.subjectUserId
                    ? entry.subjectName ?? 'one person'
                    : entry.courseTitle ?? 'one course',
                })
              }
            />
          ) : null}
        </View>
      </View>,
    ],
  };
}

/** The reader is placing an action in time, not timing it. Minutes are enough. */
function auditWhen(at: string): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return at;
  // The zone is shown because the date filter is in this same zone and a reader
  // comparing two campuses' exports has to know which clock each was read on.
  // Without it, a row dated the 31st inside a "from the 1st" filter looks like a
  // bug in the record rather than a difference of offset.
  return when.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** The `YYYY-MM-DD` the filter speaks, in the reader's own day. */
function isoDay(when: Date): string {
  // Not `toISOString().slice(0, 10)`: that is the UTC day, and east of Greenwich
  // it names tomorrow for most of the evening. `auditQueryParams` builds local
  // day boundaries, so the day handed to it has to be the local one too.
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

const styles = StyleSheet.create({
  head: { gap: lms.space.xs },
  body: { padding: lms.space.lg, gap: lms.space.md },
  prose: { maxWidth: 620 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: lms.space.sm },
  rowStack: { gap: 2, minWidth: 0 },
  // Wraps because both labels name a course, and a long title on a narrow
  // column would otherwise push the second control out of the row.
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: lms.space.sm },
  rowInline: { flexDirection: 'row', alignItems: 'center', gap: lms.space.sm, flexWrap: 'wrap' },
  strong: { fontWeight: '600' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: lms.space.md,
    flexWrap: 'wrap',
  },
  actionText: { flex: 1, minWidth: 220, gap: 2 },
  // The chosen course fills the space the table leaves rather than being pushed
  // under it. `alignItems: flex-start` keeps the shorter panel its own height
  // instead of stretching an empty card down beside a long list.
  columns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: lms.space.lg,
  },
  listColumn: { flex: 3, minWidth: 380 },
  detailColumn: { flex: 2, minWidth: 320 },
  // Bigger than the workspace default on purpose: this is the round of work that
  // holds every target to the 44px floor `lms.touch` names.
  input: { minHeight: lms.touch, fontSize: 16 },
  tall: { minHeight: lms.touch, paddingHorizontal: lms.space.lg },
});
