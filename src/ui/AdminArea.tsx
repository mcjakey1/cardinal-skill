import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  addableAccounts,
  adminActionMessage,
  adminCourseActions,
  adminUnlocked,
  lockAdmin,
  unlockAdmin,
} from '@/lib/admin';
import {
  fetchAccounts,
  fetchAllCourses,
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
}

export function AdminArea({ liveSession, courseId, onSelectCourse, onOpenChart }: AdminAreaProps) {
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
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-accounts'] }),
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

const styles = StyleSheet.create({
  head: { gap: lms.space.xs },
  body: { padding: lms.space.lg, gap: lms.space.md },
  prose: { maxWidth: 620 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: lms.space.sm },
  rowStack: { gap: 2, minWidth: 0 },
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
