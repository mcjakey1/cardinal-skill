/**
 * The admin area's door: the password that reveals it, and the session flag
 * that remembers it was opened.
 *
 * Pure on purpose — no React, no network, no storage — so the check that
 * matters has a `node --test` check sitting next to it.
 */

/**
 * Type-only, so `node --test` strips it and this module stays reachable from a
 * test with no bundler resolving `@/`.
 */
import type {
  CourseKind,
  CoursePublicationStatus,
} from '@/features/skilltree/courseDistribution';

/**
 * THE PASSWORD IS NOT SECURITY. IT IS A UI REVEAL AND NOTHING ELSE.
 *
 * Every string in this file is compiled into the app bundle and shipped to the
 * device. Anyone who installs Cardinal Skill can read this value out of the
 * JavaScript, and a modified client can skip the check entirely. So it decides
 * what is SHOWN. It must never be the thing that AUTHORISES an administrative
 * action — same rule as the anon key in `AGENTS.md`: what is in the bundle is
 * public, and the server is the boundary.
 *
 * Real authority lives in the `administrators` table added by
 * `supabase/migrations/0028_administrators_and_open_verification.sql`. Every
 * admin RPC — `admin_set_administrator`, `admin_set_course_publication`,
 * `admin_set_enrollment`, `admin_set_instructor_verification` — re-checks
 * `is_administrator()` in its own body, and RLS checks it again on the tables
 * behind them. When the real powers are wired up, they call those RPCs and each
 * one refuses an account that is not on that table, whatever this gate showed.
 * This gate stays decoration in front of a server check; it never replaces one.
 *
 * To change the password, change it here. This is the only place it appears.
 */
export const ADMIN_PASSWORD = '123456';

/**
 * What an administrator will be able to do, in the plain words the section uses.
 * None of it is wired up yet, and the section says so rather than showing dead
 * buttons.
 */
export const ADMIN_POWERS = [
  'Edit and publish any course, not only the ones they made themselves.',
  'Archive a course, which takes it out of the catalog and keeps every student record.',
  'Give an instructor their verified badge, and take it away again.',
  'Add a student to a course, and remove one.',
  'Read the progress of a named student on any course.',
] as const;

/** Trimmed, because a keyboard that adds a trailing space is not a wrong password. */
export function adminPasswordMatches(input: string): boolean {
  return input.trim() === ADMIN_PASSWORD;
}

/**
 * Unlocked-ness for as long as the app is loaded, and no longer.
 *
 * A module variable dies with the bundle, so a reload re-locks the area. That is
 * the whole requirement: it must survive walking to another section of the
 * workspace and back, and it must not survive a reload — which rules out
 * AsyncStorage, SecureStore and every other place a value could be written.
 */
let unlocked = false;

export function adminUnlocked(): boolean {
  return unlocked;
}

/** Returns whether the area is open after this attempt. */
export function unlockAdmin(input: string): boolean {
  if (adminPasswordMatches(input)) unlocked = true;
  return unlocked;
}

export function lockAdmin(): void {
  unlocked = false;
}

// --------------------------------------------------- publication transitions

/**
 * What `admin_set_course_publication` will accept for a course, decided here so
 * the screen disables the action instead of showing the exception it raises.
 */
export interface AdminCourseAction {
  status: CoursePublicationStatus;
  label: string;
  hint: string;
}

export interface AdminCoursePublication {
  /** Empty when nothing may be done; `blocked` then says why, in a sentence. */
  actions: AdminCourseAction[];
  blocked: string | null;
}

export function adminCourseActions(course: {
  kind: CourseKind;
  publicationStatus: CoursePublicationStatus;
}): AdminCoursePublication {
  if (course.kind === 'practice') {
    return {
      actions: [],
      blocked: 'A practice course is private to its owner and has nothing to publish.',
    };
  }
  return {
    actions: TRANSITIONS.filter((action) => action.status !== course.publicationStatus),
    blocked: null,
  };
}

/**
 * One entry per status, minus whichever the course is already in. Written out
 * rather than derived from COURSE_PUBLICATION_STATUSES because the sentences
 * are the point: an administrator acting on someone else's course has to be
 * told what it does to the people on it before they press it.
 */
const TRANSITIONS: AdminCourseAction[] = [
  {
    status: 'published',
    label: 'Publish',
    hint: 'Puts it back in the catalog where students can find and join it.',
  },
  {
    status: 'draft',
    label: 'Unpublish',
    hint: 'Takes it out of the catalog and hands it back to its owner as a draft. Its share link stops working.',
  },
  {
    status: 'archived',
    label: 'Archive',
    hint: 'Takes it out of the catalog and keeps every student record on it. Nothing is deleted.',
  },
];

// ------------------------------------------------------------ error messages

/**
 * What went wrong, in words an administrator can act on.
 *
 * Same distinction `publishChart.ts` draws and for the same reason: a missing
 * function is a deployment gap and a refusal is an answer, and they must not
 * read alike. The difference here is that an admin action has no undo baseline
 * to protect, so this returns the sentence rather than throwing — the screen
 * shows it in a Notice beside the button that failed.
 *
 * Anything unrecognised is passed through untouched. A sentence invented over
 * an error nobody planned for is worse than the raw one, because it reads as
 * though the cause were understood.
 */
// Names no migration number. It covers every admin function and table, which
// arrived across 0028, 0034, 0035 and 0036, and a message that names one of
// them is wrong for the other three.
const NOT_APPLIED =
  'This needs a database update that has not been applied to this project yet. '
  + 'Nothing was changed — it is a setup step, not a problem with the course.';

/** Function absent from the schema cache, function absent, table absent. */
const MISSING = ['PGRST202', '42883', '42P01', 'PGRST205'];

export function adminActionMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : null;
  // `'message' in error` walks the prototype chain, so an Error instance is
  // covered here too and needs no branch of its own.
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message ?? '')
    : '';

  if (code && MISSING.includes(code)) return NOT_APPLIED;
  if (code === '42501') {
    return message || 'Only an administrator can do that, and this account is not one.';
  }
  return message || 'That did not go through, and the server did not say why. Try it again.';
}

// -------------------------------------------------------- workspace scoping

/**
 * Which courses belong in an authoring workspace, and which of them may be
 * authored.
 *
 * NOT A SECURITY CONTROL, and it must never be mistaken for one. RLS decides
 * what the database hands back: 0001's `read enrolled courses` returns a course
 * to its owner and to anyone enrolled on it, and 0028 adds every course for an
 * administrator. This narrows what is *shown* on one screen, which is a
 * different question with a different answer — an instructor enrolled on
 * somebody else's course is a learner there, and a list that mixed the two
 * would offer to edit a chart the server will refuse to save.
 *
 * The administrator is the exception the product asks for: they see the site
 * and can act on it, because when something is wrong with a course whose owner
 * is unreachable, somebody has to be able to open it.
 */
export function authorableCourses<T extends { ownerId: string | null }>(
  courses: readonly T[],
  userId: string | null,
  isAdmin: boolean,
): (T & { canEdit: boolean })[] {
  if (isAdmin) return courses.map((course) => ({ ...course, canEdit: true }));
  // No account authors nothing. A demo session has no owner id, and treating a
  // missing one as a match would hand it every course whose owner is also null.
  if (!userId) return [];
  return courses
    .filter((course) => course.ownerId === userId)
    .map((course) => ({ ...course, canEdit: true }));
}

/**
 * Who is left to put on a course.
 *
 * The account directory minus the people already enrolled. It exists because
 * `course_roster` (0030) cannot answer this: that function returns the enrolled
 * students when anyone is enrolled, and every registered learner only when
 * nobody is — so the moment one student joins, everybody else vanishes from it
 * and there is no one left to look up and add. The directory therefore comes
 * from `profiles`, and this is what narrows it.
 *
 * Enrolment is `enrolled === true`, never the presence of a roster row. A row
 * with `enrolled: false` is 0030 saying "this account exists", which is a
 * different statement from "this account is on your course" — conflating them
 * is what would hide the very people this panel is for.
 */
export function addableAccounts<T extends { userId: string }>(
  accounts: readonly T[],
  roster: readonly { userId: string; enrolled: boolean }[],
): T[] {
  const on = new Set(roster.filter((row) => row.enrolled).map((row) => row.userId));
  return accounts.filter((account) => !on.has(account.userId));
}


// -------------------------------------------------------------- the audit log

/** One row of `audit_trail`, as the screen receives it. */
export interface AuditEntry {
  id: string;
  at: string;
  /** Null once the account is erased. Present so the filter can name an actor. */
  actorId: string | null;
  /** Resolved when the action happened, so it survives the account. */
  actorName: string;
  /**
   * Which hat was worn, not which the actor holds. Its own column and its own
   * badge — never a word inside the sentence, for the reason
   * `describeAuditAction` gives about keeping the actor out of the line.
   */
  actorRole: 'owner' | 'administrator';
  action: string;
  /** The ids are what makes a row openable. Null when there is nowhere to go. */
  subjectUserId: string | null;
  subjectName: string | null;
  subjectCourseId: string | null;
  courseTitle: string | null;
  detail: Record<string, unknown>;
}

/**
 * What one logged action says, in a sentence.
 *
 * Past tense and plain, because the reader is asking "what happened here" about
 * a change somebody else made to something they own. The actor is not in the
 * sentence: the table puts a name in its own column beside it, and repeating it
 * in every row reads as an accusation rather than a record.
 *
 * An action this build does not recognise prints its raw name. A newer
 * migration may add one, and inventing a sentence for an action whose meaning
 * is unknown would put words in an administrator's mouth — the one thing an
 * audit log must never do.
 */
export function describeAuditAction(
  entry: Pick<AuditEntry, 'action' | 'subjectName' | 'courseTitle' | 'detail'>,
): string {
  const who = entry.subjectName ?? 'a deleted account';
  // The title is written into the row when the action happens, so it outlives
  // the course. Null means none was recorded, not that it was deleted since.
  const what = entry.courseTitle ?? 'a deleted course';

  switch (entry.action) {
    case 'course.created':
      return `Created ${what}`;
    case 'course.deleted':
      return `Deleted ${what}`;
    // The title it landed on is what `was` compares against, so a rename that
    // typed the same title back in reads as a rename and claims no change.
    case 'course.renamed':
      return was(`Renamed ${what}`, entry, what);
    case 'course.owner_changed': {
      // `detail.was_name` is the outgoing owner, resolved when the transfer
      // happened. Naming them is the reason this action is recorded at all: the
      // course still reads normally afterwards, and the person who lost it is
      // the only trace that anything was taken.
      const lost = entry.detail?.was_name;
      const sentence = `Made ${who} the owner of ${what}`;
      return typeof lost === 'string' && lost ? `${sentence}, taken from ${lost}` : sentence;
    }
    case 'chart.published': {
      const moved = chartCounts(entry.detail);
      return moved ? `Published the chart of ${what}: ${moved}` : `Published the chart of ${what}`;
    }
    // The mission's own title carries the sentence: "edited a mission on X"
    // tells a reader nothing they can go and look at. A retitled mission
    // appends the old name through the same clause the catalog moves use.
    case 'mission.edited': {
      const mission =
        typeof entry.detail?.mission === 'string' ? entry.detail.mission : 'a mission';
      return was(`Edited ${mission} in ${what}`, entry, mission);
    }
    case 'course.published':
      return was(`Published ${what}`, entry, 'published');
    case 'course.unpublished':
      return was(`Took ${what} out of the catalog`, entry, 'draft');
    case 'course.archived':
      return was(`Archived ${what}`, entry, 'archived');
    case 'instructor.verified':
      return `Gave ${who} a verified instructor badge`;
    case 'instructor.revoked':
      return `Revoked the verified instructor badge from ${who}`;
    // Named only when it is an instructor. Saying "as a student" on the routine
    // row would make both rows long and neither one stand out, which is the
    // failure this branch exists to fix.
    case 'enrollment.added':
      return entry.detail?.role === 'instructor'
        ? `Added ${who} to ${what} as an instructor`
        : `Added ${who} to ${what}`;
    case 'enrollment.removed':
      return `Removed ${who} from ${what}`;
    case 'enrollment.role_changed': {
      const from = entry.detail?.from;
      const to = entry.detail?.to;
      if (typeof from !== 'string' || typeof to !== 'string') {
        return `Changed what ${who} is on ${what}`;
      }
      return `Changed ${who} from ${from} to ${to} on ${what}`;
    }
    case 'administrator.granted':
      return `Made ${who} an administrator`;
    case 'administrator.revoked':
      return `Removed ${who} as an administrator`;
    default:
      return entry.action;
  }
}

/**
 * The eight counts `publish_chart_changes` returns, in the order a reader scans
 * them: what arrived, what changed, what went away, then the edges and the
 * missions underneath.
 *
 * Singular and plural are both written out rather than an `s` appended. "1
 * nodes" is a small thing that tells a reader nobody looked at this screen.
 */
const CHART_COUNTS: readonly { key: string; one: string; many: string }[] = [
  { key: 'nodes_inserted', one: 'node added', many: 'nodes added' },
  { key: 'nodes_updated', one: 'node edited', many: 'nodes edited' },
  { key: 'nodes_archived', one: 'node hidden', many: 'nodes hidden' },
  { key: 'nodes_restored', one: 'node restored', many: 'nodes restored' },
  { key: 'prereqs_inserted', one: 'link added', many: 'links added' },
  { key: 'prereqs_deleted', one: 'link removed', many: 'links removed' },
  { key: 'missions_upserted', one: 'mission saved', many: 'missions saved' },
  { key: 'missions_deleted', one: 'mission deleted', many: 'missions deleted' },
  // Step 10 of `publish_chart_changes` repairing an out-of-step XP cache. Not
  // one of the eight the function returns, and last because a reader scans it
  // only after the changes they made themselves.
  { key: 'xp_repaired', one: "node's XP corrected", many: "nodes' XP corrected" },
];

/** Empty when nothing moved, so the caller can drop the colon with it. */
function chartCounts(detail: Record<string, unknown>): string {
  return CHART_COUNTS.flatMap(({ key, one, many }) => {
    const n = detail?.[key];
    if (typeof n !== 'number' || n <= 0) return [];
    return [`${n} ${n === 1 ? one : many}`];
  }).join(', ');
}

/**
 * Append the previous state, when there was a change to describe.
 *
 * Archiving something already archived is an ordinary slip, and a log that read
 * "Archived X, which was archived" would be reporting a change the catalog
 * never made. `settled` is the status the action lands on; matching it means
 * nothing moved.
 */
function was(
  sentence: string,
  entry: Pick<AuditEntry, 'detail'>,
  settled: string,
): string {
  const before = entry.detail?.was;
  if (typeof before !== 'string' || !before || before === settled) return sentence;
  return `${sentence}, which was ${before}`;
}

// ------------------------------------------------------------ asking narrower

/**
 * What the log is being narrowed to.
 *
 * `subjectLabel` is here so a chip on screen can say "Statistics 101" while the
 * query says the id. A filter that shows a reader a uuid is a filter they
 * cannot check.
 */
export interface AuditFilter {
  actorId: string | null;
  /** Empty is every action, not no action. */
  groups: readonly AuditGroup[];
  /** `YYYY-MM-DD`, inclusive at both ends. */
  from: string | null;
  to: string | null;
  /** Free text over the person and course names. */
  search: string;
  subjectUserId: string | null;
  subjectCourseId: string | null;
  subjectLabel: string | null;
}

/** The action groups the filter offers. Four toggles, not fourteen checkboxes. */
export type AuditGroup = 'courses' | 'charts' | 'people' | 'access';

/**
 * Grouped because that is how a reader arrives: "what has been done to our
 * courses", "who has been given what". Fourteen checkboxes would be the same
 * information arranged so nobody uses it.
 *
 * An action a newer migration adds belongs to no group here, so it is reachable
 * only with the toggles off — which is the honest default and the reason the
 * empty selection asks for everything rather than for this list.
 */
export const AUDIT_GROUPS: readonly {
  group: AuditGroup;
  label: string;
  actions: readonly string[];
}[] = [
  {
    group: 'courses',
    label: 'Courses',
    actions: [
      'course.created',
      'course.published',
      'course.unpublished',
      'course.archived',
      'course.renamed',
      'course.deleted',
      'course.owner_changed',
    ],
  },
  {
    group: 'charts',
    label: 'Charts',
    // A mission edit is a change to the tree, so it answers the same question a
    // reader ticks this box to ask. Filed here rather than under Courses for
    // that reason, not because of which table it lands in.
    actions: ['chart.published', 'mission.edited'],
  },
  {
    group: 'people',
    label: 'People',
    actions: ['enrollment.added', 'enrollment.removed', 'enrollment.role_changed'],
  },
  {
    group: 'access',
    label: 'Access',
    actions: [
      'instructor.verified',
      'instructor.revoked',
      'administrator.granted',
      'administrator.revoked',
    ],
  },
];

export const EMPTY_AUDIT_FILTER: AuditFilter = {
  actorId: null,
  groups: [],
  from: null,
  to: null,
  search: '',
  subjectUserId: null,
  subjectCourseId: null,
  subjectLabel: null,
};

/**
 * Whether anything is being narrowed.
 *
 * `subjectLabel` is not consulted: it is what the chip reads, not a narrowing
 * of its own, and a label left behind after its id was cleared must not keep
 * the screen claiming to be filtered.
 */
export function auditFilterActive(filter: AuditFilter): boolean {
  return (
    filter.actorId !== null
    || filter.groups.length > 0
    || filter.from !== null
    || filter.to !== null
    || filter.search.trim() !== ''
    || filter.subjectUserId !== null
    || filter.subjectCourseId !== null
  );
}

/**
 * One sentence for the panel head, or null when the whole record is on screen.
 *
 * An audit screen must never leave "you are looking at a slice, not the record"
 * implicit. Null rather than "Showing everything" because a permanent banner
 * describing the absence of a filter is noise a reader learns to skip, and the
 * one time it matters they would skip it too.
 */
export function describeAuditFilter(
  filter: AuditFilter,
  actorName: string | null,
): string | null {
  if (!auditFilterActive(filter)) return null;

  const labels = AUDIT_GROUPS
    .filter((entry) => filter.groups.includes(entry.group))
    .map((entry) => entry.label.toLowerCase());
  // "everything" rather than nothing, so a filter that only names a person
  // still reads as a sentence and not as a fragment starting "by".
  const parts = [labels.length > 0 ? andList(labels) : 'everything'];

  // Names, never ids. A panel head showing a uuid is one the reader cannot
  // check against what they asked for.
  if (filter.actorId !== null) parts.push(`by ${actorName ?? 'one account'}`);
  if (filter.subjectUserId !== null || filter.subjectCourseId !== null) {
    parts.push(`about ${filter.subjectLabel ?? 'one course or person'}`);
  }

  const search = filter.search.trim();
  if (search) parts.push(`matching “${search}”`);
  if (filter.from && filter.to) parts.push(`from ${filter.from} to ${filter.to}`);
  else if (filter.from) parts.push(`from ${filter.from}`);
  else if (filter.to) parts.push(`up to ${filter.to}`);

  return `Showing ${parts.join(', ')}.`;
}

/**
 * The next page under what is already loaded, newest first throughout.
 *
 * A row can arrive twice: the keyset cursor is exclusive, but a write landing
 * between two pages shifts nothing while a retry can re-fetch. Keeping the
 * first copy means the reader's scroll position stays meaningful, and a log
 * that showed one action twice would be read as two actions.
 */
export function appendAuditPage(
  loaded: readonly AuditEntry[],
  page: readonly AuditEntry[],
): AuditEntry[] {
  const seen = new Set(loaded.map((entry) => entry.id));
  return [...loaded, ...page.filter((entry) => !seen.has(entry.id))];
}

/**
 * What is loaded and filtered, as a spreadsheet can read it.
 *
 * RFC 4180: CRLF between records, a field quoted when it holds a comma, a
 * quote or a line break, and an internal quote doubled. Written out rather
 * than pulled from a library because it is nine lines and a CSV writer is the
 * most over-solved problem in this repo's dependency tree.
 *
 * `When` stays the ISO timestamp the server sent, not the screen's friendly
 * form. A spreadsheet has to sort this column, and "30 Aug 2026, 09:15" sorts
 * alphabetically into nonsense.
 */
const AUDIT_CSV_COLUMNS = [
  'When',
  'Who',
  'Acting as',
  'What they did',
  'Person',
  'Course',
  'Action',
  'Detail',
];

export function auditCsv(
  entries: readonly AuditEntry[],
  /** The panel head's own sentence, so the file and the screen cannot disagree. */
  narrowing: string | null,
  now: Date,
  /** Whether the server still had rows the screen had not loaded. */
  more = false,
): string {
  const records = [
    // Five lines of provenance and a blank one before the header. A filename
    // is the first thing to die when a file is attached to an email and renamed
    // by whoever received it, so `-filtered` on the name is not enough: the
    // reader a year from now has only what is inside the file.
    ['Cardinal Skill audit record'],
    ['Exported', now.toISOString()],
    ['Covers', narrowing ?? 'The whole record, with no filter applied.'],
    ['Rows', String(entries.length)],
    // Its own line, and never folded into `Covers`. This file is evidence, and
    // a page of a record presented as the record is the one error nobody
    // downstream can detect for themselves.
    [
      'Complete',
      more
        ? 'No — this is what had been loaded when it was exported, and more rows matched. Load them and export again for the full set.'
        : 'Yes — every row matching the filter above.',
    ],
    [''],
    AUDIT_CSV_COLUMNS,
    ...entries.map((entry) => [
      entry.at,
      entry.actorName,
      entry.actorRole,
      describeAuditAction(entry),
      // Empty, never "null". A cell reading null is a value a reader has to
      // decide about; an empty cell is the absence it actually is.
      entry.subjectName ?? '',
      entry.courseTitle ?? '',
      // The raw action as well as the sentence: the sentence is for reading and
      // this column is for filtering a pivot table.
      entry.action,
      JSON.stringify(entry.detail),
    ]),
  ];
  return records.map((cells) => cells.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value: string): string {
  // Excel and Sheets execute a cell that opens with = + - or @, and both a
  // display name and a course title are text somebody else chose. A leading
  // apostrophe is the standard defusing: the spreadsheet treats the rest as
  // text and does not show the apostrophe as content.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (!/[",\r\n]/.test(safe)) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Names the day, and says when it is only part of the record.
 *
 * The `-filtered` half is not decoration. A CSV that silently held less than
 * the reader believed is the worst failure this screen has, and the filename is
 * the one label that travels with the file after it leaves the app.
 */
export function auditCsvFilename(filter: AuditFilter, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  return `cardinal-audit-${day}${auditFilterActive(filter) ? '-filtered' : ''}.csv`;
}

export interface AuditSummaryLine {
  group: AuditGroup;
  label: string;
  count: number;
}

/**
 * How much of each kind happened lately, busiest first.
 *
 * This is what turns the log from something consulted once you already suspect
 * something into something that tells you to suspect it. "31 enrolments this
 * week" on a campus that normally does three is the whole point; nobody reaches
 * that by scrolling a chronological list.
 *
 * A group with nothing in it is left out rather than shown as zero. A row of
 * zeroes is a week's worth of nothing dressed up as data, and the caller says
 * "nothing in the last seven days" in one line instead.
 *
 * Counted over what is loaded, not over the table. The caller labels it with
 * the window so that stays honest.
 */
export function auditSummary(
  entries: readonly AuditEntry[],
  since: Date,
): AuditSummaryLine[] {
  const from = since.getTime();
  const counts = new Map<AuditGroup, number>();

  for (const entry of entries) {
    const at = Date.parse(entry.at);
    // An unparseable timestamp is not counted as recent. Guessing would put a
    // row in this week that the reader cannot find when they go looking.
    if (Number.isNaN(at) || at < from) continue;
    const group = AUDIT_GROUPS.find((entry_) => entry_.actions.includes(entry.action));
    if (!group) continue;
    counts.set(group.group, (counts.get(group.group) ?? 0) + 1);
  }

  return AUDIT_GROUPS
    .filter((entry) => (counts.get(entry.group) ?? 0) > 0)
    .map((entry) => ({
      group: entry.group,
      label: entry.label,
      count: counts.get(entry.group) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * A complete `YYYY-MM-DD` naming a day that exists, or nothing.
 *
 * Validated here rather than only at the field, because this is the one place
 * every caller routes through and the server column is a `timestamptz` that
 * refuses anything else. A half-typed date is not an error to show the reader —
 * they are mid-word — it is simply not a bound yet.
 */
export function calendarDay(value: string | null): string | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // The round trip is what catches 2026-02-31 and 2026-13-01. `Date` rolls both
  // of those forward into some other day rather than refusing them, and a
  // filter that quietly moved the reader's boundary by two days is worse than
  // one that ignored what they typed.
  const utc = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(utc.getTime()) && utc.toISOString().slice(0, 10) === value ? value : null;
}

/**
 * A calendar day's first or last instant, in the reader's own zone.
 *
 * The reader types "1 September" meaning their own 1 September, and the rows
 * they are about to compare it against are rendered in their own zone too. A
 * UTC day instead put a Central desk's range at 31 Aug 19:00 - 15 Sep 18:59:
 * the last evening of add/drop fell outside it and the evening before fell
 * inside, so the screen showed rows dated outside the range its own head
 * claimed. A range that visibly disagrees with the rows in it is not evidence.
 *
 * The cost is that two campuses in different zones asking the same question get
 * different answers. That is why `auditWhen` prints the zone beside every row —
 * one of them has to be stated, and it may as well be the one on screen.
 */
function localDay(day: string, edge: 'start' | 'end'): string | null {
  const [year, month, date] = day.split('-').map(Number);
  if (year === undefined || month === undefined || date === undefined) return null;
  const when = edge === 'end'
    ? new Date(year, month - 1, date, 23, 59, 59, 999)
    : new Date(year, month - 1, date, 0, 0, 0, 0);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

/** Four groups at most, so this stays three lines rather than an Intl call. */
function andList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Both columns, never `at` alone — one transaction gives its rows one `now()`. */
export interface AuditCursor {
  at: string;
  id: string;
}

/**
 * Where the next page starts, or null when there is no next page.
 *
 * A page shorter than what was asked for is the end of the record. That is why
 * the footer hides Show more rather than disabling it: a control certain to
 * return nothing is worse than no control.
 */
export function nextAuditCursor(
  page: readonly AuditEntry[],
  limit: number,
): AuditCursor | null {
  if (page.length < limit) return null;
  const last = page[page.length - 1];
  return last ? { at: last.at, id: last.id } : null;
}

/** Exactly the arguments `audit_trail` takes, named as it names them. */
export interface AuditQueryParams {
  p_actor: string | null;
  p_actions: string[] | null;
  p_from: string | null;
  p_to: string | null;
  p_search: string | null;
  p_subject_user: string | null;
  p_subject_course: string | null;
  p_before_at: string | null;
  p_before_id: string | null;
  p_limit: number;
}

/**
 * The whole filter, mapped to what the server takes. The only place that
 * mapping lives.
 *
 * The predicate itself is SQL and stays SQL. A predicate applied here would
 * only ever see the page already loaded, so a search that found nothing would
 * mean "not in these hundred rows" while the screen said "not in the record" —
 * which is the one lie an audit UI cannot afford. This function decides what to
 * ask for; the server decides what matches.
 */
export function auditQueryParams(
  filter: AuditFilter,
  cursor: AuditCursor | null,
  limit = 100,
): AuditQueryParams {
  // Anything that is not a whole, real day is no bound at all. The fields are
  // free text and this runs on every keystroke, so without this the server is
  // asked for "2026-0" nine times out of the ten it takes to type one date.
  const typedFrom = calendarDay(filter.from);
  const typedTo = calendarDay(filter.to);

  // Two date boxes get filled in the wrong order routinely, and a range the
  // server cannot satisfy comes back empty — which the screen would show as
  // "nothing happened", not as "you typed that backwards". Swapped, not refused.
  const swap = typedFrom !== null && typedTo !== null && typedTo < typedFrom;
  const from = swap ? typedTo : typedFrom;
  const to = swap ? typedFrom : typedTo;

  return {
    p_actor: filter.actorId,
    p_actions: filter.groups.length === 0
      ? null
      : AUDIT_GROUPS.filter((entry) => filter.groups.includes(entry.group))
          .flatMap((entry) => [...entry.actions]),
    p_from: from ? localDay(from, 'start') : null,
    p_to: to ? localDay(to, 'end') : null,
    p_search: filter.search.trim() || null,
    p_subject_user: filter.subjectUserId,
    p_subject_course: filter.subjectCourseId,
    p_before_at: cursor?.at ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: limit,
  };
}
