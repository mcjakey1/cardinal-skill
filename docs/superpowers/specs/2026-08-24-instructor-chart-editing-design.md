# Instructor chart editing

Design document · 24 August 2026 · branch `expo-redesign-gamified-student-lms-instructor`

## The problem

After a course chart is created — by the syllabus parser or by hand in
`/author` — nobody can change a node.

The student screen `/tree/[courseId]` looks like it can. It has a full editor:
add node, delete node, link prerequisites, drag to move, and a property form for
title, description, XP, icon, and missions. Every one of those handlers ends at
`persistEdit` (`app/tree/[courseId].tsx:390`), which writes to AsyncStorage
through `useEditedTree` (`src/lib/editedTree.ts:38`). Nothing reaches Supabase.
It is a device-local shadow copy, and RLS says so deliberately —
`0002_help_subtrees_and_quest_names.sql:7`: *"a student cannot retitle or
re-price the tree they are graded on."*

The instructor workspace cannot edit either. Its inspector rail is read-only
(`app/instructor.tsx:630-671`), and its "Edit by hand" button routes to
`/author`, which only ever inserts (`app/author.tsx:200`, `:230`) — there is no
update path in the application at all.

The database is not the obstacle. The owner already holds every permission
required:

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `skill_nodes` | `0001:124` | `0013:6` | `0002:56` | `0013:10` |
| `node_prereqs` | `0001:136` | `0013:17` | **none** | `0013:25` |
| `missions` | `0003:68` | `0003:74` (`for all`) | `0003:74` | `0003:74` |

The gap is the client.

## What this builds

An instructor selects a node on the chart in `/instructor → Skill tree` and
edits it. Adds nodes, re-links prerequisites, moves them, rewrites missions,
retires nodes that no longer belong. Edits accumulate in a local draft with
unlimited undo. Publishing validates the graph, shows what the change will do to
students, and applies everything in one transaction.

## Decisions

Four questions were settled before this document was written. They are recorded
here because each one closed off a design branch.

**Editing lives in the instructor inspector**, not in `/author` and not in the
student screen. `/author` would need a slug-to-uuid mapping and a draft/publish
round trip built for creation, not revision. The student screen would put graded
authoring inside a student-styled surface and add a role branch to every save
path.

**Draft, then publish.** Edits do not reach students until the instructor
publishes. A live-write model would expose half-built charts — a deleted node
before its dependants are re-linked, a cycle mid-construction — to students who
are graded on them.

**Archive, never delete.** Deleting a node cascades to `node_progress`
(`0001:147`), `missions` and through them `mission_progress` (`0003:23`,
`0003:52`), `help_requests` (`0002:73`), and the node's entire help subtree via
`parent_node_id` (`0002:16`). Student records are destroyed and cannot be
recovered — an instructor cannot even read them to back them up, because
`0002` forbids it. A boolean flag makes retirement reversible.

**Archived XP stays banked.** `xp_events` is a denormalised ledger keyed on
`course_id`, with `node_id` nullable and `on delete set null` (`0001:158`).
Archiving does not claw back points a student already earned. The course
denominator shrinks while the numerator holds, so completion percentages rise
for students who had cleared the archived node. `progressRatio`
(`progression.ts:56`) already clamps to 1, so no meter can exceed 100%.

## Architecture

Five units. Four are pure and testable with no Supabase, no React, and no
AsyncStorage — the constraint that keeps the existing 170-test suite runnable
offline.

| Unit | File | Purpose |
| --- | --- | --- |
| Draft state and undo | `src/features/skilltree/chartDraft.ts` | Snapshot, op log, apply/undo/redo |
| Diff | `src/features/skilltree/chartDiff.ts` | `diffCharts(live, draft)` → change set |
| Impact | `src/features/skilltree/chartImpact.ts` | Change set + cohort counts → what publish hides |
| Publish client | `src/features/skilltree/publishChart.ts` | Change set → RPC payload, one call |
| UI | `app/instructor.tsx`, `src/ui/lms.tsx` | Canvas edit mode, editable inspector, change tray, confirm |

Flow: `fetchTree` seeds the draft baseline → edits push ops onto the working
copy → Publish re-fetches live, diffs against it, computes impact, confirms,
calls `publish_chart_changes`, invalidates the query cache.

Diffing is a pure function of two graphs. Undo is a pure function of a stack.
Neither knows about the other.

## Data model

### Migration `0014_archive_skill_nodes.sql`

```sql
alter table public.skill_nodes
  add column archived boolean not null default false;

create index skill_nodes_course_live_idx
  on public.skill_nodes (course_id, sort_order) where not archived;
```

Every predicate added below is `course_id = ? and not archived`, which this
partial index serves.

### The policy is the real gate

Archiving hides nodes from students through one RLS policy, not through query
filters scattered across the client. `read nodes of enrolled courses`
(`0001:124`) is the single point, and `read missions of readable nodes`
(`0003:68`) inherits it automatically — policy subqueries are evaluated as the
querying role, so a mission whose node is hidden becomes unreadable without a
second predicate.

The owner branch must **not** filter. An owner who cannot see an archived row
cannot unarchive it.

Postgres has no `create or replace policy`; the migration uses `alter policy`.

```sql
alter policy "read nodes of enrolled courses" on public.skill_nodes
  using (
    (track_id is not null and not archived)
    or exists (
      select 1 from courses c
      where c.id = skill_nodes.course_id
        and (c.owner_id = auth.uid()
             or (not skill_nodes.archived
                 and exists (select 1 from enrollments e
                             where e.course_id = c.id and e.user_id = auth.uid())))
    )
  );
```

One related leak is fixed in the same migration. `read prereqs of readable
nodes` (`0001:136`) checks only `node_id`, so an edge pointing *at* an archived
node stays visible:

```sql
alter policy "read prereqs of readable nodes" on public.node_prereqs
  using (
    exists (select 1 from skill_nodes n where n.id = node_prereqs.node_id)
    and exists (select 1 from skill_nodes n where n.id = node_prereqs.prereq_id)
  );
```

### Functions that count nodes

Six functions need changing. Three of them have no `skill_nodes` reference at
all today — they lean on the denormalised `course_id` on `missions` and
`help_requests` — so each needs a join added, not a `where` clause.

| Function | Definition | Change |
| --- | --- | --- |
| `course_progress_summary` | `0001:191` | add `and not n.archived` at `:197` |
| `course_mission_summary` | `0003:100` | add `join skill_nodes n on n.id = m.node_id`, then `and not n.archived` |
| `course_cohort_summary` | `0003:118` | same join and predicate; moves the 5-student suppression floor |
| `help_request_summary` | `0002:99` | add join on `h.node_id`, then predicate — otherwise archived nodes appear as struggle hotspots |
| `course_student_progress` | `0005:114` | **two** predicates: denominator at `:128`, numerator at `:157`. Fixing one alone breaks the percentage in the obvious direction |
| `request_help_subtree` | `0004:30` | add `and not n.archived` to the parent lookup at `:66` — the definer context bypasses the RLS that would otherwise hide it, so a student could graft help onto a retired node |

Two functions are deliberately **not** changed:

- `total_xp_for_course` (`0001:181`) reads `xp_events` only and has no path to
  `archived`. Per the decision above, banked XP survives.
- `reset_own_course_progress` (`0008:1`) deletes the caller's own rows. Adding
  the predicate would orphan progress rows that reappear as completed the moment
  a node is unarchived, after the student was told their progress was reset.

`owns_course`, `owns_node_course`, `owns_mission_course`, and `teaches_student`
are ownership predicates orthogonal to archived state. Adding the filter to
`owns_node_course` would make its scalar subquery return null, collapsing to
`false`, and revoke the owner's access to the very rows they need to restore.

### Archiving walks the subtree

`archived` does not cascade. A syllabus node's help steps
(`parent_node_id = <node>`, `graded = false`) stay visible under a hidden
parent. The archive step in the publish function archives the node and its help
descendants in the same statement.

## The publish function

### Why an RPC

The Supabase JS client cannot run a multi-statement transaction. A publish that
inserts three nodes, archives one, and rewrites eight edges is four or more
round trips that can half-fail. With undo layered on top, a half-applied change
set plus a now-wrong undo baseline is the worst state this design can reach.

```sql
create function public.publish_chart_changes(p_course_id uuid, p_changes jsonb)
returns table (
  nodes_inserted    integer,
  nodes_updated     integer,
  nodes_archived    integer,
  nodes_restored    integer,
  prereqs_deleted   integer,
  prereqs_inserted  integer,
  missions_upserted integer,
  missions_deleted  integer
)
language plpgsql security definer set search_path = public
```

`returns table` of counts matches house style; there is no `returns jsonb`
anywhere in the existing migrations, and `course_cohort_summary` (`0003:118`) is
the existing single-row-of-figures shape. Counts come from
`get diagnostics ... = row_count` after each statement.

Grants follow the established form:

```sql
revoke all on function public.publish_chart_changes(uuid, jsonb) from public, anon;
grant execute on function public.publish_chart_changes(uuid, jsonb) to authenticated;
```

### Security definer bypasses RLS entirely

No table in this schema sets `force row level security`. Inside a
`security definer` function the policies in the table above **do not run**. Every
guard they would have applied must be re-implemented in the body — including
the per-endpoint checks from `0013:20-22`, without which this function is a
cross-course write primitive.

Following the repo's convention, authorization is the third step, not the first:
validate argument shape, resolve and prove scope, then authorize, then domain
invariants, then writes (`0004:56` → `:64` → `:71` → `:78` → `:158`).

### Statement order

Order is forced by the triggers, the foreign keys, and the primary key on
`node_prereqs`.

```
0. Gate       owns_course(p_course_id), else raise
1. Shape      each section of p_changes is a jsonb array, else raise
2. Scope      every referenced node id — updates, archives, both edge
              endpoints, mission parents — either already has
              course_id = p_course_id or appears in the insert batch
3. INSERT     skill_nodes, explicit ids, course_id = p_course_id,
              track_id null, parent_node_id and graded set together
4. UPDATE     skill_nodes fields — not xp_reward yet
5. UPDATE     skill_nodes set archived, node plus help descendants
6. DELETE     node_prereqs being removed or re-pointed
7. INSERT     node_prereqs (node_id, prereq_id) only
8. DELETE     missions being removed
9. UPSERT     missions on conflict (id) do update
10. UPDATE    skill_nodes.xp_reward = sum of that node's missions
```

Each step earns its position:

- **Nodes before edges and missions.** `sync_prereq_course` (`0001:109`) and
  `sync_mission_course` (`0003:37`) do `select course_id into new.course_id from
  skill_nodes where id = new.node_id`. A missing row leaves `course_id` null
  rather than raising, and the failure then surfaces as an opaque foreign-key
  error naming `node_prereqs_node_id_fkey`. Step 2 pre-empts it with a readable
  message.
- **Never supply `course_id`** on `node_prereqs` or `missions`. Both triggers
  overwrite it. `request_help_subtree` documents the same omission inline at
  `0004:166`.
- **Edge deletes before inserts.** The primary key is `(node_id, prereq_id)`
  (`0001:103`), so re-pointing a surviving tuple collides otherwise. There is no
  UPDATE policy on `node_prereqs` anyway — delete and insert is the only shape.
- **`xp_reward` last.** It is a cache of the mission sum, and
  `request_help_subtree` asserts the invariant at `0004:137-140`. Letting the
  two drift makes the chart and the record report different totals for one node,
  and eventually makes help requests fail on that node.

### Constraints the payload must satisfy

| Constraint | Definition | Requirement |
| --- | --- | --- |
| `node_has_one_parent` | `0001:92` | `course_id` set, `track_id` null |
| `xp_reward` range | `0001:86`, `0003:28` | 0–10000, never null |
| `node_kind` enum | `0001:77` | one of `topic`, `reading`, `assignment`, `assessment`, `project` |
| `help_nodes_are_ungraded` | `0002:25` | `parent_node_id` and `graded` move in the **same** statement |
| `skill_nodes_icon_key_check` | `0007:5` | null or one of 18 keys |
| `syllabus_topic` length | `0011:8` | ≤ 240 chars |
| `universal_skill` length | `0011:10` | ≤ 120 chars |
| `learning_objectives` | `0011:5`, `0011:12` | never null (`'{}'`), ≤ 4 elements |
| `no_self_prereq` | `0001:104` | filter `node_id = prereq_id` |
| `estimated_minutes` | `0003:29` | null allowed, **0 is not** — coerce 0 to null |

**The database does not detect cycles.** `no_self_prereq` is the only graph
guard it has. `validateGraph` on the client is the sole protection against
A → B → A, which is why Publish is disabled until it passes.

## Client modules

### `chartDraft.ts`

Split the way `src/lib/store.ts` splits: pure reducer functions with injected
storage, plus a hook alongside. The pure half is tested; the hook is not, matching
`nodeLayout.ts`, `questNames.ts`, and `signals.ts`.

```ts
interface ChartDraft {
  baseline: ChartState;   // as fetched, for stale detection
  working:  ChartState;   // what publish diffs
  ops:      ChartOp[];    // undo stack
  cursor:   number;       // redo position
}

interface ChartState { nodes: SkillNode[]; prereqs: Prereq[]; missions: Mission[] }

/** The editable subset of a node. Never includes id, courseId, or trackId. */
type NodePatch = Partial<Pick<SkillNode,
  'title' | 'description' | 'kind' | 'xpReward' | 'iconKey' | 'sortOrder'>>
  & { titleOverride?: string | null };

type XY = { x: number; y: number };

type ChartOp =
  | { t: 'add';     node: SkillNode }
  | { t: 'archive'; nodeId: string }
  | { t: 'restore'; nodeId: string }
  | { t: 'field';   nodeId: string; before: NodePatch; after: NodePatch }
  | { t: 'move';    nodeId: string; before: XY; after: XY }
  | { t: 'link' | 'unlink'; nodeId: string; prereqId: string }
  | { t: 'mission'; nodeId: string; before: Mission[]; after: Mission[] };
```

Every op carries `before`, so undo is a pure inverse rather than a replay from
baseline.

Storage: `createStore<ChartDraft>(AsyncStorage, chartDraftKey(courseId), 1, EMPTY)`.
Key format `cardinal.chart-draft.v1.${courseId}`, matching
`cardinal.edited-tree.v1.` (`editedTree.ts:11`). `createStore` discards values
from older versions rather than migrating them (`store.ts:42`), which is the
right behaviour for a draft.

The new key is added to the `purgeCourseCache` list (`editedTree.ts:52`).

New nodes get their uuid client-side via `crypto.randomUUID()`, so an edge to a
brand-new node can be written in the same batch with no insert-then-map round
trip.

The hook follows the `useNodeLayout` template (`nodeLayout.ts:30-78`): store
built in `useMemo` keyed on `courseId`, `let live = true` load guard, mutators
that set React state before awaiting `store.save`, and a `ready` flag with the
`firstSave` ref guard from `author.tsx:106-114` so an empty initial state cannot
overwrite stored work.

### `chartDiff.ts`

`diffCharts(live: ChartState, draft: ChartState): ChartChangeSet`. Compares by
id and emits the payload sections the RPC expects. Pure, no storage, no network.

### `chartImpact.ts`

Takes the change set and the counts already available from
`course_progress_summary` and `course_mission_summary`, and reports what each
archive will hide: students affected, missions hidden, edges left dangling, help
descendants carried along. Pure.

**The counts inherit a privacy floor.** Both functions end in
`having count(*) >= 5` (`0001:204`, `0003:112`) — a node fewer than five
students have cleared returns no row at all. The impact panel therefore cannot
say "3 students completed this". It says **"fewer than 5 students"** for any
node absent from the summary, and an exact figure only above the floor. This is
the same boundary `Insights` already lives behind (*"Averages stay hidden below
5 students, because a figure over two people is not an average"*), and it is not
worked around: a definer function returning exact small counts to an instructor
would reopen precisely what `0002` closed.

Consequence for the confirm dialog: below the floor it reports structure exactly
— missions hidden, edges dangling, help descendants — and student impact only as
a bound.

### `publishChart.ts`

Serialises the change set and makes one `supabase.rpc('publish_chart_changes')`
call. The only impure module.

## User interface

### Instructor page

`CourseRow` (`instructor.tsx:79`) gains `canEdit`. It is constructed in exactly
two places: the query at `:270`, whose `.select('id, title, term')` at `:273`
must widen to include `owner_id`, and the demo fixture literal at `:285`, which
takes `canEdit: false` — the example chart is not a real course and must never
be publishable. The three mock courses are equally unowned and equally
read-only.

`TreeSection` (`:607`) gains `canEdit` alongside the existing `flat` and
`motionOff` props, and the editing state machine. That state machine cannot be
inherited from `SkillTree`. The component accepts every edit prop but owns no
edit state: `onDeleteNode` receives no node id, `onAddNode` reports only a
coordinate, and link completion is not a callback at all — it arrives through
`onSelectNode` and is resolved in the caller (`[courseId].tsx:394-419`). Two
hard gates matter: `ChartTools` renders no pencil unless `onToggleEditMode` is
passed (`ChartTools.tsx:56`), and the edit toolbar requires `editMode &&
onAddNode && onToggleLinkMode` together (`SkillTree.tsx:656`).

One inherited bug to avoid: `selected` holds the node *object*, not an id
(`:624`), and is never re-derived from `data`. After publish-and-refetch it is a
stale copy. The form keys off `selected.id` and reads the live node from
`data.tree`.

Node positions are written into the draft and published as `x`/`y`. They must
**not** go through `useNodeLayout`, which is explicitly device-local —
`nodeLayout.ts:1-13`: *"An instructor rearranging the real layout is a different
feature, and it goes through the same owner-gated write `/author` uses."* This
is that feature.

### Renaming pins the name against regeneration

The name field writes `title_override`, not `title`. That column exists for
exactly this — `0002:45`: *"A title an instructor typed by hand. `name-quest`
skips any node where this is set, which is the entire reason the column
exists."* `title` stays as the syllabus wrote it.

This is what makes the feature work on generated nodes as well as authored ones.
`resolveName` (`naming.ts:31`) ranks override over generated over syllabus, so
the inspector shows which of the three the current name came from, and an edit
promotes it to an override that `name-quest` will not overwrite on a later run.
Clearing the field writes null and the node falls back to its generated or
syllabus name — surfaced as *Reset to generated name* when the source is
`override`.

`quest_title` and `quest_subtitle` are not editable. They are generated output;
an instructor who dislikes one overrides the name instead.

### The inspector rail cannot hold a form as it stands

`styles.inspectorWide` is `width: 300` — hard, not `maxWidth` — leaving a 268px
content box after padding. The container has no `flex: 1` and no `ScrollView`,
so a tall form overflows the viewport with no way to reach its bottom. Changes:
widen to 340, add `flex: 1`, and wrap the contents in a `ScrollView`. Nothing
else keys off 300.

Below `lms.wide` (860px) the tree is deliberately rendered outside the page's
`ScrollView` — `instructor.tsx:371`: *"the canvas is a map, and a map inside a
scroll view is a map you cannot pan."* A stacked form would squeeze the canvas
to its 360px floor and then clip, with no scroll recovery and no
`KeyboardAvoidingView` in the file. On narrow screens the editor is a
full-height sheet over the canvas rather than a third stacked band.

Anything absolutely positioned inside `TreeSection` renders *below* the nav
drawer, which is a later sibling of `styles.main` (`:419`). The confirm dialog
mounts at the page level, not inside the section.

### New LMS primitives

`src/ui/lms.tsx` has no modal, no dialog, and no destructive button. It imports
only `Pressable, ScrollView, StyleSheet, Text, TextInput, View`, and its
stylesheet contains no `position: absolute`. Three additions:

- `LModal` — backdrop, `accessibilityViewIsModal`, heading, body, right-aligned
  actions. Structure follows `CourseSelector.tsx:210`; every token comes from
  `lms`, because that file is drawn in student pixel tokens and reusing it is
  the mixing `CLAUDE.md` forbids. The scrim colour and shadow can be lifted from
  `instructor.tsx:1304-1317`.
- `LButton` gains a `danger` variant. Current variants are `default | primary |
  quiet`.
- `Field` gains an `error?: string` prop. There is no field-level error state
  today; `Notice tone="error"` is the only failure surface in the kit.

The change tray is a plain stack, not a `DataTable` — `DataTable` sets
`minWidth: 620` (`lms.tsx:538`) and would force horizontal scrolling inside a
340px rail.

### Edit chrome is drawn in student tokens

`SkillTree`'s edit toolbar and link banner use `bevelStyle`, `PixelText`, and
`DotGothic16` throughout, with no LMS variant and no provider swap that could
restyle them. Pixel-art tool chrome will float over a warm institutional
workspace. The existing sanctioned exception covers the chart *content* — an
instructor should see the artifact as delivered — but tool chrome is a new
category. This design accepts it rather than forking the toolbar, on the
grounds that the tools act on the artifact and read as part of it. Revisit if it
looks wrong in practice.

## Cache invalidation

Two client caches shadow the server, and one wins outright.

`fetchTree` returns `loadCachedTree(courseId)` whenever the live query errors
(`queries.ts:83`), serving the entire pre-archive snapshot — nodes and missions.

Worse, the student screen reads `edited?.tree ?? data?.tree`
(`[courseId].tsx:183`). A student who ever grafted a help subtree keeps their
edited tree indefinitely, archive or no archive. This is a pre-existing bug that
archiving makes visible: a retired node stays on that student's chart forever.
The fix is to stamp the draft with the node id set it was built from and drop it
when the server set no longer contains those nodes. It belongs in this work
because archiving is what makes it bite.

`purgeCourseCache` (`editedTree.ts:52`) already clears all six per-course keys
and is the invalidation hook. The new draft key joins that list.

One client-side filter is still needed regardless of RLS: missions are selected
by `course_id`, not by node (`queries.ts:71`), so archived-node missions survive
a node-level filter in any path that bypasses the policy. `nodeIds` is already
in scope at `queries.ts:120` and applied to `masteredIds` at `:124` — apply it
to missions at `:131` as well.

Query keys to invalidate after publish: `['instructor-tree', courseId]`,
`['instructor-cohort', courseId]`, `['instructor-roster', courseId]`,
`['instructor-courses']`.

## Validation and failure

**Publish is disabled until `validateGraph(nodes, prereqs)` passes** — the same
function gating `/author` at `app/author.tsx:117`. It is the only cycle
detection in the system. The button explains which node blocks it.

**Stale course.** Publish re-fetches live and compares against
`draft.baseline`. If they differ, it stops and offers a reload. No silent merge,
no last-write-wins — another instructor or a syllabus re-parse may have moved
the chart underneath.

**Partial failure** cannot occur: the RPC is one transaction.

**Errors** follow the repo's voice — lowercase, second person, `%`
interpolation, no SQLSTATE: `'that is not your course'`, `'an edge must stay
inside this course'`, `'a node cannot require itself'`.

## Testing

Four pure modules, all runnable under the existing
`node --test --experimental-strip-types "src/**/*.test.ts"` with no Supabase
credentials — 170 tests pass that way today because no test imports
`supabase.ts`, React, or AsyncStorage.

Conventions to match: `import assert from 'node:assert/strict'` then
`import { test } from 'node:test'`; explicit `.ts` extensions on every relative
import; no `@/` alias in tests, because `node --test` does not resolve it;
lowercase descriptions stating the rule as a fact, in the house "X, not Y"
idiom. The in-memory `StorageLike` helper is copied from `store.test.ts:6-21`
into the new test file rather than exported, per repo habit.

- `chartDraft.test.ts` — apply then undo round-trips to identity; redo is
  cleared by a new op after undo; a draft from an older version reads as empty.
- `chartDiff.test.ts` — an unedited draft yields an empty change set; each op
  type produces exactly its writes and no others.
- `chartImpact.test.ts` — archiving a node with no progress reports no impact;
  help descendants are counted with their parent.
- `publishChart.test.ts` — a change set serialises to the payload shape the RPC
  parses, with `course_id` omitted from edges and missions, and
  `estimated_minutes: 0` coerced to null.

UI behaviour — canvas edit mode, the inspector form, the undo stack, the
validation gate — is verified with `playwright-cli` against the running app.

**The gap:** `.env` holds placeholder Supabase values, so the migration, the six
function changes, and `publish_chart_changes` cannot be exercised end to end
until real credentials exist. Everything above the RPC boundary can be. This is
stated rather than worked around.

## Out of scope

- Course-level metadata editing, which already exists in `updateCourseMetadata`
  (`courseQueries.ts:47`).
- Editing universal-track nodes. They have `course_id is null`, and `0002:54`
  keeps tracks staff-authored. The editor excludes them.
- Editing another instructor's course. `canEdit` is ownership, not role.
- Bulk operations, import/merge of a re-parsed syllabus into an existing chart,
  and version history beyond one undo baseline.

## Risks

**The archive predicate must land in all six functions at once.** A half-applied
migration leaves archived nodes counted in one figure and not another, which
reads as a data bug rather than a missing filter.

**Cycle detection lives entirely on the client.** If a future write path reaches
`node_prereqs` without passing `validateGraph`, the database will accept a cycle
and `deriveStatuses` will silently drop the edge, leaving a node permanently
locked with no visible cause.

**`xp_reward` as a cache of the mission sum is enforced in only one direction.**
`request_help_subtree` asserts it (`0004:137`), but nothing stops a future writer
from drifting the two. Step 10 of the publish order is the whole defence.
