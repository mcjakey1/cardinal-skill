# Instructor Chart Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a course owner edit any node on a published chart — add, rename, re-price, re-link, move, retire — through a local draft with undo, published in one transaction.

**Architecture:** Edits accumulate in an AsyncStorage draft holding a working copy plus an op log. Publish re-fetches the live chart, diffs the two graphs, shows what the change does to students, and applies everything through one security-definer RPC. Deletion is an `archived` flag, never a `DELETE`, because deleting a node cascades student progress away irrecoverably.

**Tech Stack:** Expo + React Native (web/iOS/Android), TypeScript, Supabase (Postgres + RLS), TanStack Query, `node --test` with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-08-24-instructor-chart-editing-design.md`

## Global Constraints

- **Tests must run with no Supabase credentials.** No test may import `src/lib/supabase.ts`, React, or `@react-native-async-storage/async-storage`. 170 tests pass this way today; keep it true.
- **Test imports:** `import assert from 'node:assert/strict';` then `import { test } from 'node:test';`. Explicit `.ts` extension on every relative import. Never the `@/` alias in a test — `node --test` does not resolve it.
- **Test names:** lowercase, no "should", stating the rule as a fact. House idiom is "X, not Y".
- **Test command:** `npm test` → `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "src/**/*.test.ts"`. Node ≥ 22.13.0.
- **SQL style:** every function sets `search_path = public`. Writers are `language plpgsql security definer`; read-only helpers are `language sql stable security definer`. Errors use `raise exception` with a lowercase second-person sentence and `%` interpolation — no SQLSTATE. Grants are always spelled out: `revoke ... from public, anon;` then `grant execute ... to authenticated;`. Use `public.` qualification (the style from `0006` onward).
- **`security definer` bypasses RLS.** No table sets `force row level security`. Every guard an RLS policy would apply must be re-implemented in the function body.
- **Never `DELETE` a `skill_nodes` row** in any new code path. Archive is an `UPDATE`.
- **Never supply `course_id`** when inserting into `node_prereqs` or `missions` — the `sync_prereq_course` and `sync_mission_course` triggers overwrite it.
- **XP invariant:** for any node that has missions, `skill_nodes.xp_reward` must equal the sum of that node's `missions.xp_reward`. `request_help_subtree` asserts this at `0004:137-140`.
- **Two designs, no mixing.** `/instructor` uses `src/theme/lms.ts` and `src/ui/lms.tsx`. Never import `src/theme/tokens.ts` or `src/ui/pixel.tsx` into new instructor UI. The chart canvas itself is the one sanctioned exception and already exists.

---

## File Structure

**Create:**

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0014_archive_skill_nodes.sql` | `archived` column, index, two policy rewrites, six function rewrites |
| `supabase/migrations/0015_chart_publish.sql` | `chart_archive_impact`, `publish_chart_changes` |
| `src/lib/chartDraftKey.ts` | The AsyncStorage key string, isolated so it can be tested without AsyncStorage |
| `src/lib/chartDraftKey.test.ts` | Key format test |
| `src/features/skilltree/chartDraft.ts` | Pure draft reducer: op types, apply, undo, redo. No storage, no React |
| `src/features/skilltree/chartDraft.test.ts` | Reducer tests |
| `src/features/skilltree/chartDiff.ts` | `diffCharts(live, draft)` → change set. Pure |
| `src/features/skilltree/chartDiff.test.ts` | Diff tests |
| `src/features/skilltree/chartImpact.ts` | Change set + impact rows → confirm-dialog readout. Pure |
| `src/features/skilltree/chartImpact.test.ts` | Impact tests |
| `src/features/skilltree/publishChart.ts` | Change set → RPC payload; the two Supabase calls |
| `src/features/skilltree/publishChart.test.ts` | Payload serialisation tests (payload builder is exported separately from the calls) |
| `src/lib/useChartDraft.ts` | React hook wrapping `createStore`. Untested, like `nodeLayout.ts` |

**Modify:**

| File | Change |
| --- | --- |
| `src/features/skilltree/queries.ts:131` | Filter missions by surviving node ids |
| `src/lib/editedTree.ts:52` | Add the draft key to `purgeCourseCache` |
| `src/lib/editedTree.ts:13-50` | Drop a stale edited tree whose nodes no longer exist server-side |
| `src/ui/lms.tsx` | Add `LModal`; `danger` variant on `LButton`; `error` prop on `Field` |
| `app/instructor.tsx:79-83, :273, :285` | `CourseRow.canEdit` |
| `app/instructor.tsx:607-728` | `TreeSection`: edit state machine, editable inspector, change tray, publish confirm |
| `app/instructor.tsx:1333-1346` | Inspector styles: width 340, `flex: 1`, scrolling |

---

## Task 1: Archive column, policies, and the six counting functions

**Files:**
- Create: `supabase/migrations/0014_archive_skill_nodes.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `public.skill_nodes.archived boolean not null default false`. Every read path below it treats an archived node as absent.

- [ ] **Step 1: Create the migration file with the column and index**

```sql
-- Retiring a node cannot be a delete. node_progress (0001:147), missions and
-- through them mission_progress (0003:23, 0003:52), help_requests (0002:73),
-- and the node's whole help subtree via parent_node_id (0002:16) all cascade.
-- An instructor cannot even back the records up first: 0002 forbids reading a
-- named student's record. So retirement is a flag, and it is reversible.
--
-- XP already banked stays banked. xp_events is keyed on course_id with a
-- nullable node_id (0001:158), so archiving takes nothing away from a student
-- who earned it. The course denominator shrinks and completion percentages
-- rise; progressRatio (progression.ts:56) clamps at 1.

alter table public.skill_nodes
  add column archived boolean not null default false;

create index skill_nodes_course_live_idx
  on public.skill_nodes (course_id, sort_order) where not archived;
```

- [ ] **Step 2: Append the two policy rewrites**

Postgres has no `create or replace policy`. Both use `alter policy`. The owner branch must not filter — an owner who cannot see an archived row cannot restore it.

```sql
-- The single gate. Fix it here and archived nodes disappear from every student
-- read at once; "read missions of readable nodes" (0003:68) inherits it,
-- because a policy subquery is evaluated as the querying role.
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

-- 0001:136 checked only node_id, so an edge pointing AT an archived node stayed
-- visible and drew a dangling arrow.
alter policy "read prereqs of readable nodes" on public.node_prereqs
  using (
    exists (select 1 from skill_nodes n where n.id = node_prereqs.node_id)
    and exists (select 1 from skill_nodes n where n.id = node_prereqs.prereq_id)
  );
```

- [ ] **Step 3: Append `course_progress_summary` and `course_mission_summary`**

```sql
create or replace function course_progress_summary(p_course_id uuid)
returns table (node_id uuid, mastered_count integer)
language sql stable security definer set search_path = public as $$
  select p.node_id, count(*)::integer
  from node_progress p
  join skill_nodes n on n.id = p.node_id
  where n.course_id = p_course_id and not n.archived
    and p.status = 'mastered'
    and exists (
      select 1 from courses c
      where c.id = p_course_id and c.owner_id = auth.uid()
    )
  group by p.node_id
  having count(*) >= 5;
$$;

create or replace function course_mission_summary(p_course_id uuid)
returns table (mission_id uuid, node_id uuid, completed_count integer)
language sql stable security definer set search_path = public as $$
  select m.id, m.node_id, count(*)::integer
  from mission_progress mp
  join missions m on m.id = mp.mission_id
  join skill_nodes n on n.id = m.node_id
  where m.course_id = p_course_id and not n.archived
    and exists (
      select 1 from courses c
      where c.id = p_course_id and c.owner_id = auth.uid()
    )
  group by m.id, m.node_id
  having count(*) >= 5;
$$;
```

`course_mission_summary` had no `skill_nodes` reference at all — it leaned on the denormalised `missions.course_id`. The join is new, not just the predicate.

- [ ] **Step 4: Append `course_cohort_summary` and `help_request_summary`**

```sql
create or replace function course_cohort_summary(p_course_id uuid)
returns table (students integer, missions_completed integer, avg_missions_per_student numeric)
language sql stable security definer set search_path = public as $$
  with cohort as (
    select count(distinct mp.user_id)::integer as students,
           count(*)::integer                   as missions_completed
    from mission_progress mp
    join missions m on m.id = mp.mission_id
    join skill_nodes n on n.id = m.node_id
    where m.course_id = p_course_id and not n.archived
  )
  select cohort.students,
         cohort.missions_completed,
         round(cohort.missions_completed::numeric / nullif(cohort.students, 0), 1)
  from cohort
  where cohort.students >= 5
    and exists (
      select 1 from courses c
      where c.id = p_course_id and c.owner_id = auth.uid()
    );
$$;

-- Without the join an archived node keeps appearing as a struggle hotspot.
create or replace function help_request_summary(p_course_id uuid)
returns table (node_id uuid, requester_count integer)
language sql stable security definer set search_path = public as $$
  select h.node_id, count(distinct h.requested_by)::integer
  from help_requests h
  join skill_nodes n on n.id = h.node_id
  where h.course_id = p_course_id and not n.archived
    and exists (
      select 1 from courses c
      where c.id = p_course_id and c.owner_id = auth.uid()
    )
  group by h.node_id
  having count(distinct h.requested_by) >= 5;
$$;
```

Note for the reviewer: the archived predicate moves `course_cohort_summary`'s five-student suppression floor. A cohort whose only completions were on now-archived nodes drops below five and the function returns no row. That is correct behaviour, not a bug.

- [ ] **Step 5: Append `course_student_progress` with both predicates**

The denominator and the numerator must both be filtered. Fixing one alone breaks the percentage in the obvious direction.

```sql
create or replace function course_student_progress(p_course_id uuid)
returns table (
  user_id      uuid,
  display_name text,
  mastered     integer,
  graded_nodes integer,
  progress     integer,
  xp           integer,
  last_active  timestamptz
)
language sql stable security definer set search_path = public as $$
  with graded as (
    select count(*)::integer as total
    from skill_nodes
    where course_id = p_course_id and graded and not archived
  )
  select
    r.user_id,
    coalesce(nullif(p.display_name, ''), 'Unnamed student'),
    coalesce(m.mastered, 0),
    graded.total,
    case
      when graded.total = 0 then 0
      else round(coalesce(m.mastered, 0)::numeric * 100 / graded.total)::integer
    end,
    coalesce(x.xp, 0),
    m.last_active
  from (
    select e.user_id
    from enrollments e
    where e.course_id = p_course_id and e.role = 'student'
  ) r
  cross join graded
  left join profiles p on p.id = r.user_id
  left join lateral (
    select count(*)::integer as mastered, max(np.completed_at) as last_active
    from node_progress np
    join skill_nodes n on n.id = np.node_id
    where np.user_id = r.user_id
      and n.course_id = p_course_id
      and n.graded
      and not n.archived
      and np.status = 'mastered'
  ) m on true
  left join lateral (
    select coalesce(sum(xe.amount), 0)::integer as xp
    from xp_events xe
    where xe.user_id = r.user_id and xe.course_id = p_course_id
  ) x on true
  where owns_course(p_course_id)
  order by 5, 2;
$$;
```

The `xp` lateral is deliberately unchanged: banked XP survives archiving.

- [ ] **Step 6: Append the `request_help_subtree` guard**

This function is 160 lines and `create or replace` needs the whole body. Copy `supabase/migrations/0004_help_reprices_missions.sql:30-188` verbatim into the new migration, then change exactly one statement — the parent lookup that currently reads:

```sql
  select n.course_id, n.xp_reward into v_course_id, v_old_xp
  from skill_nodes n
  where n.id = p_node_id and n.parent_node_id is null and n.course_id is not null;
```

to:

```sql
  select n.course_id, n.xp_reward into v_course_id, v_old_xp
  from skill_nodes n
  where n.id = p_node_id and n.parent_node_id is null and n.course_id is not null
    and not n.archived;
```

Change nothing else. The existing `if v_course_id is null then raise exception 'that node is not one help can be added to'` immediately below now covers the archived case too. Without this a student can graft a help subtree onto a retired node, because the definer context bypasses the RLS that would hide it.

Do **not** re-declare the grants for this function; `0004:190-197` already set them and they survive `create or replace`.

- [ ] **Step 7: Append the header comment recording what is deliberately unchanged**

```sql
-- Two functions are deliberately NOT filtered.
--
-- total_xp_for_course (0001:181) reads xp_events only and has no path to
-- archived. Banked XP stays banked, by decision.
--
-- reset_own_course_progress (0008:1) deletes the caller's own rows. Filtering
-- it would orphan progress that reappears as completed the moment a node is
-- restored, after the student was told their progress was reset.
--
-- owns_course / owns_node_course / owns_mission_course / teaches_student are
-- ownership predicates, orthogonal to archived state. Adding the filter to
-- owns_node_course would make its scalar subquery return null, collapse to
-- false, and revoke the owner's access to the rows they need to restore.
```

- [ ] **Step 8: Verify the migration applies**

Requires Docker for the local Supabase stack. Run:

```bash
npx supabase start
npm run db:reset
```

Expected: every migration applies with no error, ending in `Finished supabase db reset.`

If Docker is unavailable, stop and report that this task is unverified rather than marking it done. Do not proceed to Task 2 assuming it applied.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0014_archive_skill_nodes.sql
git commit -m "feat(db): archive skill nodes instead of deleting them"
```

---

## Task 2: The impact and publish functions

**Files:**
- Create: `supabase/migrations/0015_chart_publish.sql`

**Interfaces:**
- Consumes: `skill_nodes.archived` from Task 1
- Produces: two RPCs called by `src/features/skilltree/publishChart.ts` in Task 8 —
  - `chart_archive_impact(p_course_id uuid, p_node_ids uuid[])` → rows of `(node_id uuid, students_completed integer, missions_hidden integer, mission_completions integer, help_descendants integer)`
  - `publish_chart_changes(p_course_id uuid, p_changes jsonb)` → one row of `(nodes_inserted, nodes_updated, nodes_archived, nodes_restored, prereqs_deleted, prereqs_inserted, missions_upserted, missions_deleted)`, all `integer`

- [ ] **Step 1: Write `chart_archive_impact`**

```sql
-- Exact counts, no suppression floor.
--
-- course_progress_summary and course_mission_summary suppress below five
-- students and keep doing so — Class insights is built on that and says so in
-- its own copy. This is a different question: a pre-flight check on a
-- destructive action, run by the owner of the course, about their own students.
--
-- security definer bypasses RLS, so three guards carry the security here:
-- owns_course gates the caller, n.course_id = p_course_id stops node ids from a
-- course they do not own, and the function returns counts only — never a
-- user_id, a name, or any row identifying who completed what.
--
-- Recorded consequence: combined with the per-student totals the roster already
-- shows (course_student_progress, 0005:114), exact per-node counts let an
-- instructor infer individual completions in a small cohort. That is an
-- accepted product decision. This function is the single place to change it.

create or replace function public.chart_archive_impact(
  p_course_id uuid,
  p_node_ids  uuid[]
)
returns table (
  node_id             uuid,
  students_completed  integer,
  missions_hidden     integer,
  mission_completions integer,
  help_descendants    integer
)
language sql stable security definer set search_path = public as $$
  select
    n.id,
    (select count(*)::integer from node_progress np
      where np.node_id = n.id and np.status = 'mastered'),
    (select count(*)::integer from missions m
      where m.node_id = n.id),
    (select count(*)::integer from mission_progress mp
       join missions m on m.id = mp.mission_id
      where m.node_id = n.id),
    (select count(*)::integer from skill_nodes h
      where h.parent_node_id = n.id and not h.archived)
  from skill_nodes n
  where n.id = any(p_node_ids)
    and n.course_id = p_course_id
    and owns_course(p_course_id);
$$;

revoke all on function public.chart_archive_impact(uuid, uuid[]) from public, anon;
grant execute on function public.chart_archive_impact(uuid, uuid[]) to authenticated;
```

- [ ] **Step 2: Write the `publish_chart_changes` signature and guards**

Authorization is the third step, following `0004:56` → `:64` → `:71`.

```sql
create or replace function public.publish_chart_changes(
  p_course_id uuid,
  p_changes   jsonb
)
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
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  nodes_inserted := 0; nodes_updated := 0; nodes_archived := 0; nodes_restored := 0;
  prereqs_deleted := 0; prereqs_inserted := 0; missions_upserted := 0; missions_deleted := 0;

  -- 1. Shape.
  if p_changes is null
     or jsonb_typeof(p_changes -> 'insert_nodes')     <> 'array'
     or jsonb_typeof(p_changes -> 'update_nodes')     <> 'array'
     or jsonb_typeof(p_changes -> 'archive_nodes')    <> 'array'
     or jsonb_typeof(p_changes -> 'restore_nodes')    <> 'array'
     or jsonb_typeof(p_changes -> 'delete_prereqs')   <> 'array'
     or jsonb_typeof(p_changes -> 'insert_prereqs')   <> 'array'
     or jsonb_typeof(p_changes -> 'upsert_missions')  <> 'array'
     or jsonb_typeof(p_changes -> 'delete_missions')  <> 'array' then
    raise exception 'every section of a publish must be a JSON array';
  end if;

  -- 2. Authorization.
  if not owns_course(p_course_id) then
    raise exception 'that is not your course';
  end if;

  -- 3. Scope. security definer runs no WITH CHECK, so the guard from
  -- 0013:20-22 must be reproduced here or this is a cross-course write
  -- primitive. Every node id the caller names must already sit on this
  -- course, or arrive in this batch.
  if exists (
    select 1 from (
      select (x ->> 'id')::uuid as id from jsonb_array_elements(p_changes -> 'update_nodes')  x
      union all
      select (x ->> 'id')::uuid              from jsonb_array_elements(p_changes -> 'archive_nodes') x
      union all
      select (x ->> 'id')::uuid              from jsonb_array_elements(p_changes -> 'restore_nodes') x
      union all
      select (x ->> 'node_id')::uuid         from jsonb_array_elements(p_changes -> 'insert_prereqs') x
      union all
      select (x ->> 'prereq_id')::uuid       from jsonb_array_elements(p_changes -> 'insert_prereqs') x
      union all
      select (x ->> 'node_id')::uuid         from jsonb_array_elements(p_changes -> 'delete_prereqs') x
      union all
      select (x ->> 'prereq_id')::uuid       from jsonb_array_elements(p_changes -> 'delete_prereqs') x
      union all
      select (x ->> 'node_id')::uuid         from jsonb_array_elements(p_changes -> 'upsert_missions') x
    ) ref
    where not exists (
      select 1 from skill_nodes n
      where n.id = ref.id and n.course_id = p_course_id
    )
    and not exists (
      select 1 from jsonb_array_elements(p_changes -> 'insert_nodes') s
      where (s ->> 'id')::uuid = ref.id
    )
  ) then
    raise exception 'a publish can only touch nodes on this course';
  end if;

  -- An id in upsert_missions that already exists elsewhere would be reassigned
  -- into this course by the `on conflict (id) do update set node_id` in step 9,
  -- carrying its mission_progress rows with it. A valid node_id is not enough:
  -- the mission's current home has to be this course too. `read missions of
  -- readable nodes` (0003:68) is not owner-scoped, so the caller can see ids
  -- they must not be able to move.
  --
  -- `is distinct from`, not `<>`: a missions row whose course_id is null must
  -- be rejected, and a null comparison would pass it silently.
  if exists (
    select 1 from jsonb_array_elements(p_changes -> 'upsert_missions') m
    join missions old on old.id = (m ->> 'id')::uuid
    where old.course_id is distinct from p_course_id
  ) then
    raise exception 'a publish can only touch missions on this course';
  end if;
```

- [ ] **Step 3: Write the node writes — steps 3, 4, 5 of the required order**

```sql
  -- 3. Insert. Explicit ids so edges and missions in this same batch can
  -- reference them. track_id stays null (node_has_one_parent, 0001:92), and
  -- parent_node_id travels with graded in one statement
  -- (help_nodes_are_ungraded, 0002:25).
  insert into skill_nodes (
    id, course_id, track_id, title, description, kind, xp_reward,
    icon_key, x, y, sort_order, parent_node_id, graded, title_override
  )
  select
    (s ->> 'id')::uuid, p_course_id, null,
    s ->> 'title', coalesce(s ->> 'description', ''),
    coalesce((s ->> 'kind')::node_kind, 'topic'),
    coalesce((s ->> 'xp_reward')::integer, 50),
    s ->> 'icon_key',
    coalesce((s ->> 'x')::double precision, 0),
    coalesce((s ->> 'y')::double precision, 0),
    coalesce((s ->> 'sort_order')::integer, 0),
    null, true, s ->> 'title_override'
  from jsonb_array_elements(p_changes -> 'insert_nodes') s;
  get diagnostics v_n = row_count; nodes_inserted := v_n;

  -- 4. Field updates. coalesce against the existing row so an omitted key is
  -- "unchanged", never "null" — every one of these columns is NOT NULL.
  -- xp_reward is deliberately not written here; it is settled in step 10.
  update skill_nodes n set
    title          = coalesce(u ->> 'title', n.title),
    description    = coalesce(u ->> 'description', n.description),
    kind           = coalesce((u ->> 'kind')::node_kind, n.kind),
    icon_key       = case when u ? 'icon_key' then u ->> 'icon_key' else n.icon_key end,
    title_override = case when u ? 'title_override'
                          then nullif(btrim(coalesce(u ->> 'title_override', '')), '')
                          else n.title_override end,
    x              = coalesce((u ->> 'x')::double precision, n.x),
    y              = coalesce((u ->> 'y')::double precision, n.y),
    sort_order     = coalesce((u ->> 'sort_order')::integer, n.sort_order)
  from jsonb_array_elements(p_changes -> 'update_nodes') u
  where n.id = (u ->> 'id')::uuid and n.course_id = p_course_id;
  get diagnostics v_n = row_count; nodes_updated := v_n;

  -- 5. Archive. An UPDATE, never a DELETE. archived does not cascade, so the
  -- node's help steps are archived with it or they stay visible under a hidden
  -- parent.
  update skill_nodes n set archived = true
  where n.course_id = p_course_id
    and (
      n.id in (select (a ->> 'id')::uuid from jsonb_array_elements(p_changes -> 'archive_nodes') a)
      or n.parent_node_id in (select (a ->> 'id')::uuid from jsonb_array_elements(p_changes -> 'archive_nodes') a)
    )
    and not n.archived;
  get diagnostics v_n = row_count; nodes_archived := v_n;

  update skill_nodes n set archived = false
  where n.course_id = p_course_id
    and (
      n.id in (select (r ->> 'id')::uuid from jsonb_array_elements(p_changes -> 'restore_nodes') r)
      or n.parent_node_id in (select (r ->> 'id')::uuid from jsonb_array_elements(p_changes -> 'restore_nodes') r)
    )
    and n.archived;
  get diagnostics v_n = row_count; nodes_restored := v_n;
```

- [ ] **Step 4: Write the edge and mission writes — steps 6 through 10**

```sql
  -- 6. Edge deletes BEFORE inserts: the primary key is (node_id, prereq_id)
  -- (0001:103), so re-pointing a surviving tuple would collide. There is no
  -- UPDATE policy on node_prereqs anyway.
  delete from node_prereqs p
  using jsonb_array_elements(p_changes -> 'delete_prereqs') d
  where p.node_id   = (d ->> 'node_id')::uuid
    and p.prereq_id = (d ->> 'prereq_id')::uuid
    and p.course_id = p_course_id;
  get diagnostics v_n = row_count; prereqs_deleted := v_n;

  -- 7. Edge inserts AFTER the node inserts. course_id is omitted: the
  -- node_prereqs_sync_course trigger from 0001 fills it. Self-edges are
  -- filtered here rather than left to no_self_prereq, so the error the
  -- instructor sees is ours.
  insert into node_prereqs (node_id, prereq_id)
  select (e ->> 'node_id')::uuid, (e ->> 'prereq_id')::uuid
  from jsonb_array_elements(p_changes -> 'insert_prereqs') e
  where (e ->> 'node_id')::uuid <> (e ->> 'prereq_id')::uuid
  on conflict (node_id, prereq_id) do nothing;
  get diagnostics v_n = row_count; prereqs_inserted := v_n;

  -- 8. Mission deletes before upserts, so delete-then-reinsert of one id
  -- cannot collide.
  delete from missions m
  using jsonb_array_elements(p_changes -> 'delete_missions') d
  where m.id = (d ->> 'id')::uuid and m.course_id = p_course_id;
  get diagnostics v_n = row_count; missions_deleted := v_n;

  -- 9. Mission upserts. course_id omitted (missions_sync_course, 0003:45).
  -- estimated_minutes has a `> 0` check (0003:29), so 0 becomes null.
  insert into missions (id, node_id, title, description, kind, xp_reward, estimated_minutes, sort_order)
  select
    (m ->> 'id')::uuid, (m ->> 'node_id')::uuid,
    m ->> 'title', coalesce(m ->> 'description', ''),
    coalesce((m ->> 'kind')::node_kind, 'topic'),
    coalesce((m ->> 'xp_reward')::integer, 0),
    nullif((m ->> 'estimated_minutes')::integer, 0),
    coalesce((m ->> 'sort_order')::integer, 0)
  from jsonb_array_elements(p_changes -> 'upsert_missions') m
  on conflict (id) do update set
    node_id           = excluded.node_id,
    title             = excluded.title,
    description       = excluded.description,
    kind              = excluded.kind,
    xp_reward         = excluded.xp_reward,
    estimated_minutes = excluded.estimated_minutes,
    sort_order        = excluded.sort_order;
  get diagnostics v_n = row_count; missions_upserted := v_n;

  -- 10. xp_reward LAST. It is a cache of the mission sum, asserted by
  -- request_help_subtree at 0004:137-140. Only nodes this batch touched, and
  -- only nodes that actually have missions — a node with none keeps its own
  -- authored value.
  update skill_nodes n set xp_reward = s.total
  from (
    select m.node_id, sum(m.xp_reward)::integer as total
    from missions m
    where m.course_id = p_course_id
    group by m.node_id
  ) s
  where n.id = s.node_id
    and n.course_id = p_course_id
    and n.xp_reward <> s.total;

  return next;
end;
$$;

revoke all on function public.publish_chart_changes(uuid, jsonb) from public, anon;
grant execute on function public.publish_chart_changes(uuid, jsonb) to authenticated;
```

- [ ] **Step 5: Verify both functions apply and reject a foreign course**

```bash
npm run db:reset
```

Expected: applies cleanly. Then, in `npx supabase db psql` as an unauthenticated role, confirm the guard fires:

```sql
select * from public.publish_chart_changes(
  '00000000-0000-0000-0000-000000000000'::uuid,
  '{"insert_nodes":[],"update_nodes":[],"archive_nodes":[],"restore_nodes":[],
    "delete_prereqs":[],"insert_prereqs":[],"upsert_missions":[],"delete_missions":[]}'::jsonb
);
```

Expected: `ERROR: that is not your course`.

If Docker is unavailable, report the task as unverified rather than marking it done.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0015_chart_publish.sql
git commit -m "feat(db): add chart_archive_impact and publish_chart_changes"
```

---

## Task 3: The draft storage key

**Files:**
- Create: `src/lib/chartDraftKey.ts`
- Test: `src/lib/chartDraftKey.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `chartDraftStorageKey(courseId: string): string`

This mirrors `src/lib/nodeLayoutKey.ts` — the key lives alone so a test can assert its format without importing AsyncStorage.

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chartDraftStorageKey } from './chartDraftKey.ts';

test('chart drafts use the documented per-course AsyncStorage key', () => {
  assert.equal(chartDraftStorageKey('abc'), 'cardinal.chart-draft.v1.abc');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './chartDraftKey.ts'`.

- [ ] **Step 3: Write the implementation**

```ts
/** One draft per course. Matches the `cardinal.<name>.v1.<courseId>` family. */
export const chartDraftStorageKey = (courseId: string) => `cardinal.chart-draft.v1.${courseId}`;
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Add the key to `purgeCourseCache`**

In `src/lib/editedTree.ts`, import the builder and add it to the array at `:53`:

```ts
import { chartDraftStorageKey } from './chartDraftKey';
```

```ts
  await AsyncStorage.multiRemove([
    `cardinal.progress.v1.${courseId}`,
    `cardinal.missions.v1.${courseId}`,
    `cardinal.questnames.v1.${courseId}`,
    `cardinal.signals.v1.${courseId}`,
    `@cardinal_nodes_${courseId}`,
    `@cardinal_layout_${courseId}`,
    editedTreeKey(courseId),
    chartDraftStorageKey(courseId),
  ]);
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/chartDraftKey.ts src/lib/chartDraftKey.test.ts src/lib/editedTree.ts
git commit -m "feat: add the chart draft storage key"
```

---

## Task 4: The draft reducer

**Files:**
- Create: `src/features/skilltree/chartDraft.ts`
- Test: `src/features/skilltree/chartDraft.test.ts`

**Interfaces:**
- Consumes: `SkillNode`, `Prereq`, `Mission` from `./types`
- Produces:
  - `interface ChartState { nodes: SkillNode[]; prereqs: Prereq[]; missions: Mission[] }`
  - `interface ChartDraft { baseline: ChartState; working: ChartState; ops: ChartOp[]; cursor: number }`
  - `type NodePatch`, `type XY`, `type ChartOp` (shapes below)
  - `emptyDraft(state: ChartState): ChartDraft`
  - `applyOp(draft: ChartDraft, op: ChartOp): ChartDraft`
  - `undo(draft: ChartDraft): ChartDraft`
  - `redo(draft: ChartDraft): ChartDraft`
  - `canUndo(draft: ChartDraft): boolean`, `canRedo(draft: ChartDraft): boolean`

This file must not import React, AsyncStorage, or `supabase`. Use a relative import for `./types.ts`, not the `@/` alias.

- [ ] **Step 1: Write the failing tests**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyOp, canRedo, emptyDraft, redo, undo, type ChartState } from './chartDraft.ts';
import type { SkillNode } from './types.ts';

function node(id: string, extra: Partial<SkillNode> = {}): SkillNode {
  return {
    id, courseId: 'c', trackId: null, title: id, description: '',
    kind: 'topic', xpReward: 50, x: 0, y: 0, sortOrder: 0, ...extra,
  };
}

const STATE: ChartState = {
  nodes: [node('a'), node('b')],
  prereqs: [{ nodeId: 'b', prereqId: 'a' }],
  missions: [],
};

test('an applied op followed by undo returns the working copy it started from', () => {
  const start = emptyDraft(STATE);
  const edited = applyOp(start, {
    t: 'field', nodeId: 'a', before: { title: 'a' }, after: { title: 'Renamed' },
  });

  assert.equal(edited.working.nodes.find((n) => n.id === 'a')?.title, 'Renamed');
  assert.deepEqual(undo(edited).working, start.working);
});

test('redo is cleared by a new op, not kept alongside it', () => {
  const start = emptyDraft(STATE);
  const once = applyOp(start, { t: 'move', nodeId: 'a', before: { x: 0, y: 0 }, after: { x: 10, y: 5 } });
  const back = undo(once);

  assert.equal(canRedo(back), true, 'undo leaves something to redo');

  const diverged = applyOp(back, { t: 'move', nodeId: 'b', before: { x: 0, y: 0 }, after: { x: 3, y: 3 } });

  assert.equal(canRedo(diverged), false, 'a new branch drops the old redo tail');
  assert.equal(diverged.working.nodes.find((n) => n.id === 'a')?.x, 0, 'the undone move stays undone');
});

test('archiving a node keeps it in the working copy, flagged, not removed', () => {
  const edited = applyOp(emptyDraft(STATE), { t: 'archive', nodeId: 'b' });

  assert.equal(edited.working.nodes.length, 2, 'archive is a flag, never a removal');
  assert.equal(edited.working.nodes.find((n) => n.id === 'b')?.archived, true);
});

test('an unlink removes only the named edge', () => {
  const edited = applyOp(emptyDraft(STATE), { t: 'unlink', nodeId: 'b', prereqId: 'a' });

  assert.deepEqual(edited.working.prereqs, []);
  assert.deepEqual(undo(edited).working.prereqs, [{ nodeId: 'b', prereqId: 'a' }]);
});

test('redo after undo replays the same op', () => {
  const once = applyOp(emptyDraft(STATE), { t: 'archive', nodeId: 'a' });

  assert.equal(redo(undo(once)).working.nodes.find((n) => n.id === 'a')?.archived, true);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './chartDraft.ts'`.

- [ ] **Step 3: Add `archived` to `SkillNode`**

In `src/features/skilltree/types.ts`, inside the `SkillNode` interface, after the `graded` field:

```ts
  /**
   * Retired by the course owner. Archived nodes are hidden from students by
   * RLS; the owner still reads them so they can be restored. Never delete a
   * node — `node_progress` and `mission_progress` cascade away with it.
   */
  archived?: boolean;
```

- [ ] **Step 4: Write the reducer**

```ts
/**
 * The draft an instructor edits before publishing.
 *
 * Two jobs, kept apart on purpose. `working` is the state publish diffs against
 * the live chart — a plain graph, no history. `ops` is the undo stack, and every
 * op carries its own `before`, so undo is a pure inverse rather than a replay
 * from `baseline`. Publish never reads `ops`; undo never reads `baseline`.
 *
 * Pure. No storage, no React — `useChartDraft` wires those, and this file stays
 * runnable under `node --test`.
 */

import type { Mission, Prereq, SkillNode } from './types.ts';

export interface ChartState {
  nodes: SkillNode[];
  prereqs: Prereq[];
  missions: Mission[];
}

/** The editable subset of a node. Never id, courseId, or trackId. */
export type NodePatch = Partial<
  Pick<SkillNode, 'title' | 'description' | 'kind' | 'xpReward' | 'iconKey' | 'sortOrder'>
> & { titleOverride?: string | null };

export type XY = { x: number; y: number };

export type ChartOp =
  | { t: 'add'; node: SkillNode }
  | { t: 'archive'; nodeId: string }
  | { t: 'restore'; nodeId: string }
  | { t: 'field'; nodeId: string; before: NodePatch; after: NodePatch }
  | { t: 'move'; nodeId: string; before: XY; after: XY }
  | { t: 'link'; nodeId: string; prereqId: string }
  | { t: 'unlink'; nodeId: string; prereqId: string }
  | { t: 'mission'; nodeId: string; before: Mission[]; after: Mission[] };

export interface ChartDraft {
  /** As fetched. Publish compares a fresh read against this to detect staleness. */
  baseline: ChartState;
  working: ChartState;
  ops: ChartOp[];
  /** How many of `ops` are applied. Everything past it is redoable. */
  cursor: number;
}

const clone = (state: ChartState): ChartState => ({
  nodes: state.nodes.map((n) => ({ ...n })),
  prereqs: state.prereqs.map((p) => ({ ...p })),
  missions: state.missions.map((m) => ({ ...m })),
});

export function emptyDraft(state: ChartState): ChartDraft {
  return { baseline: clone(state), working: clone(state), ops: [], cursor: 0 };
}

const patchNode = (node: SkillNode, patch: NodePatch): SkillNode => ({ ...node, ...patch });

const mapNode = (state: ChartState, id: string, f: (n: SkillNode) => SkillNode): ChartState => ({
  ...state,
  nodes: state.nodes.map((n) => (n.id === id ? f(n) : n)),
});

/** One op forward. Never mutates its argument. */
function forward(state: ChartState, op: ChartOp): ChartState {
  switch (op.t) {
    case 'add':
      return { ...state, nodes: [...state.nodes, { ...op.node }] };
    case 'archive':
      return mapNode(state, op.nodeId, (n) => ({ ...n, archived: true }));
    case 'restore':
      return mapNode(state, op.nodeId, (n) => ({ ...n, archived: false }));
    case 'field':
      return mapNode(state, op.nodeId, (n) => patchNode(n, op.after));
    case 'move':
      return mapNode(state, op.nodeId, (n) => ({ ...n, x: op.after.x, y: op.after.y }));
    case 'link':
      return state.prereqs.some((p) => p.nodeId === op.nodeId && p.prereqId === op.prereqId)
        ? state
        : { ...state, prereqs: [...state.prereqs, { nodeId: op.nodeId, prereqId: op.prereqId }] };
    case 'unlink':
      return {
        ...state,
        prereqs: state.prereqs.filter((p) => !(p.nodeId === op.nodeId && p.prereqId === op.prereqId)),
      };
    case 'mission':
      return {
        ...state,
        missions: [...state.missions.filter((m) => m.skillId !== op.nodeId), ...op.after.map((m) => ({ ...m }))],
      };
  }
}

/** The exact inverse of `forward`. This is why every op carries `before`. */
function backward(state: ChartState, op: ChartOp): ChartState {
  switch (op.t) {
    case 'add':
      return { ...state, nodes: state.nodes.filter((n) => n.id !== op.node.id) };
    case 'archive':
      return mapNode(state, op.nodeId, (n) => ({ ...n, archived: false }));
    case 'restore':
      return mapNode(state, op.nodeId, (n) => ({ ...n, archived: true }));
    case 'field':
      return mapNode(state, op.nodeId, (n) => patchNode(n, op.before));
    case 'move':
      return mapNode(state, op.nodeId, (n) => ({ ...n, x: op.before.x, y: op.before.y }));
    case 'link':
      return forward(state, { ...op, t: 'unlink' });
    case 'unlink':
      return forward(state, { ...op, t: 'link' });
    case 'mission':
      return {
        ...state,
        missions: [...state.missions.filter((m) => m.skillId !== op.nodeId), ...op.before.map((m) => ({ ...m }))],
      };
  }
}

export function applyOp(draft: ChartDraft, op: ChartOp): ChartDraft {
  // A new op after an undo drops the redo tail. Keeping it would let redo
  // replay an op against a state it was never recorded on.
  const ops = [...draft.ops.slice(0, draft.cursor), op];
  return { ...draft, working: forward(draft.working, op), ops, cursor: ops.length };
}

export const canUndo = (draft: ChartDraft) => draft.cursor > 0;
export const canRedo = (draft: ChartDraft) => draft.cursor < draft.ops.length;

export function undo(draft: ChartDraft): ChartDraft {
  if (!canUndo(draft)) return draft;
  const op = draft.ops[draft.cursor - 1]!;
  return { ...draft, working: backward(draft.working, op), cursor: draft.cursor - 1 };
}

export function redo(draft: ChartDraft): ChartDraft {
  if (!canRedo(draft)) return draft;
  const op = draft.ops[draft.cursor]!;
  return { ...draft, working: forward(draft.working, op), cursor: draft.cursor + 1 };
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npm test`
Expected: PASS, and the pre-existing 170 tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/skilltree/chartDraft.ts src/features/skilltree/chartDraft.test.ts src/features/skilltree/types.ts
git commit -m "feat: add the chart draft reducer with undo and redo"
```

---

## Task 5: The diff

**Files:**
- Create: `src/features/skilltree/chartDiff.ts`
- Test: `src/features/skilltree/chartDiff.test.ts`

**Interfaces:**
- Consumes: `ChartState` from `./chartDraft.ts`
- Produces:
  - `interface ChartChangeSet { insertNodes: SkillNode[]; updateNodes: SkillNode[]; archiveNodes: string[]; restoreNodes: string[]; deletePrereqs: Prereq[]; insertPrereqs: Prereq[]; upsertMissions: Mission[]; deleteMissions: string[] }`
  - `diffCharts(live: ChartState, draft: ChartState): ChartChangeSet`
  - `isEmptyChangeSet(set: ChartChangeSet): boolean`
  - `countChanges(set: ChartChangeSet): number`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ChartState } from './chartDraft.ts';
import { countChanges, diffCharts, isEmptyChangeSet } from './chartDiff.ts';
import type { Mission, SkillNode } from './types.ts';

function node(id: string, extra: Partial<SkillNode> = {}): SkillNode {
  return {
    id, courseId: 'c', trackId: null, title: id, description: '',
    kind: 'topic', xpReward: 50, x: 0, y: 0, sortOrder: 0, ...extra,
  };
}

function mission(id: string, skillId: string, extra: Partial<Mission> = {}): Mission {
  return { id, skillId, title: id, description: '', kind: 'topic', xpReward: 10, ...extra };
}

const LIVE: ChartState = {
  nodes: [node('a'), node('b')],
  prereqs: [{ nodeId: 'b', prereqId: 'a' }],
  missions: [mission('m1', 'a')],
};

test('an untouched draft produces no writes at all', () => {
  const set = diffCharts(LIVE, LIVE);

  assert.equal(isEmptyChangeSet(set), true);
  assert.equal(countChanges(set), 0);
});

test('a node present only in the draft is an insert, not an update', () => {
  const set = diffCharts(LIVE, { ...LIVE, nodes: [...LIVE.nodes, node('c')] });

  assert.deepEqual(set.insertNodes.map((n) => n.id), ['c']);
  assert.deepEqual(set.updateNodes, []);
});

test('a changed field is an update and an unchanged node is left alone', () => {
  const set = diffCharts(LIVE, { ...LIVE, nodes: [node('a', { title: 'Renamed' }), node('b')] });

  assert.deepEqual(set.updateNodes.map((n) => n.id), ['a']);
});

test('archiving is reported as an id, never as a node removal', () => {
  const set = diffCharts(LIVE, { ...LIVE, nodes: [node('a'), node('b', { archived: true })] });

  assert.deepEqual(set.archiveNodes, ['b']);
  assert.deepEqual(set.updateNodes, [], 'the archive flag alone is not a field update');
});

test('a node dropped from the draft entirely is ignored, because publish never deletes', () => {
  const set = diffCharts(LIVE, { ...LIVE, nodes: [node('a')] });

  assert.equal(isEmptyChangeSet(set), true, 'a missing node is not a delete instruction');
});

test('a re-pointed edge is one delete and one insert', () => {
  const set = diffCharts(LIVE, { ...LIVE, prereqs: [{ nodeId: 'a', prereqId: 'b' }] });

  assert.deepEqual(set.deletePrereqs, [{ nodeId: 'b', prereqId: 'a' }]);
  assert.deepEqual(set.insertPrereqs, [{ nodeId: 'a', prereqId: 'b' }]);
});

test('a mission gone from the draft is a delete, and a re-priced one is an upsert', () => {
  const set = diffCharts(LIVE, { ...LIVE, missions: [mission('m1', 'a', { xpReward: 25 }), mission('m2', 'b')] });

  assert.deepEqual(set.upsertMissions.map((m) => m.id), ['m1', 'm2']);
  assert.deepEqual(set.deleteMissions, []);

  const removed = diffCharts(LIVE, { ...LIVE, missions: [] });
  assert.deepEqual(removed.deleteMissions, ['m1']);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './chartDiff.ts'`.

- [ ] **Step 3: Write the diff**

```ts
/**
 * What publish has to write, derived from two graphs rather than from the edit
 * history. The op log drives undo; it never drives publish — replaying ops
 * against a chart that moved underneath is how a draft corrupts a live course.
 *
 * A node missing from the draft is not a delete. Publish never deletes a node,
 * because `node_progress` and `mission_progress` cascade with it. Retirement is
 * the `archived` flag, which arrives as a node that is still present.
 *
 * Pure.
 */

import type { ChartState } from './chartDraft.ts';
import type { Mission, Prereq, SkillNode } from './types.ts';

export interface ChartChangeSet {
  insertNodes: SkillNode[];
  updateNodes: SkillNode[];
  archiveNodes: string[];
  restoreNodes: string[];
  deletePrereqs: Prereq[];
  insertPrereqs: Prereq[];
  upsertMissions: Mission[];
  deleteMissions: string[];
}

const EDITABLE = [
  'title', 'description', 'kind', 'xpReward', 'iconKey', 'x', 'y', 'sortOrder', 'titleOverride',
] as const;

const edgeKey = (p: Prereq) => `${p.nodeId}<-${p.prereqId}`;

function fieldsDiffer(live: SkillNode, draft: SkillNode): boolean {
  return EDITABLE.some((k) => (live as Record<string, unknown>)[k] !== (draft as Record<string, unknown>)[k]);
}

function missionsDiffer(live: Mission, draft: Mission): boolean {
  return live.title !== draft.title
    || live.description !== draft.description
    || live.kind !== draft.kind
    || live.xpReward !== draft.xpReward
    || live.estimatedMinutes !== draft.estimatedMinutes
    || live.skillId !== draft.skillId;
}

export function diffCharts(live: ChartState, draft: ChartState): ChartChangeSet {
  const liveNodes = new Map(live.nodes.map((n) => [n.id, n]));
  const liveEdges = new Map(live.prereqs.map((p) => [edgeKey(p), p]));
  const liveMissions = new Map(live.missions.map((m) => [m.id, m]));
  const draftEdges = new Map(draft.prereqs.map((p) => [edgeKey(p), p]));
  const draftMissionIds = new Set(draft.missions.map((m) => m.id));

  const set: ChartChangeSet = {
    insertNodes: [], updateNodes: [], archiveNodes: [], restoreNodes: [],
    deletePrereqs: [], insertPrereqs: [], upsertMissions: [], deleteMissions: [],
  };

  for (const node of draft.nodes) {
    const before = liveNodes.get(node.id);
    if (!before) {
      set.insertNodes.push(node);
      continue;
    }
    if (Boolean(before.archived) !== Boolean(node.archived)) {
      (node.archived ? set.archiveNodes : set.restoreNodes).push(node.id);
    }
    if (fieldsDiffer(before, node)) set.updateNodes.push(node);
  }

  for (const [key, edge] of liveEdges) if (!draftEdges.has(key)) set.deletePrereqs.push(edge);
  for (const [key, edge] of draftEdges) if (!liveEdges.has(key)) set.insertPrereqs.push(edge);

  for (const m of draft.missions) {
    const before = liveMissions.get(m.id);
    if (!before || missionsDiffer(before, m)) set.upsertMissions.push(m);
  }
  for (const id of liveMissions.keys()) if (!draftMissionIds.has(id)) set.deleteMissions.push(id);

  return set;
}

export function countChanges(set: ChartChangeSet): number {
  return set.insertNodes.length + set.updateNodes.length + set.archiveNodes.length
    + set.restoreNodes.length + set.deletePrereqs.length + set.insertPrereqs.length
    + set.upsertMissions.length + set.deleteMissions.length;
}

export const isEmptyChangeSet = (set: ChartChangeSet) => countChanges(set) === 0;
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/skilltree/chartDiff.ts src/features/skilltree/chartDiff.test.ts
git commit -m "feat: diff a chart draft against the live chart"
```

---

## Task 6: The impact readout

**Files:**
- Create: `src/features/skilltree/chartImpact.ts`
- Test: `src/features/skilltree/chartImpact.test.ts`

**Interfaces:**
- Consumes: `ChartChangeSet` from `./chartDiff.ts`
- Produces:
  - `interface ImpactRow { nodeId: string; studentsCompleted: number; missionsHidden: number; missionCompletions: number; helpDescendants: number }` — one row per node, exactly the shape `chart_archive_impact` returns
  - `interface ArchiveImpact { nodeId: string; title: string; studentsCompleted: number; missionsHidden: number; missionCompletions: number; helpDescendants: number; danglingEdges: number }`
  - `summariseImpact(set: ChartChangeSet, live: ChartState, rows: ImpactRow[]): ArchiveImpact[]`
  - `hasDestructiveChanges(set: ChartChangeSet): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ChartState } from './chartDraft.ts';
import type { ChartChangeSet } from './chartDiff.ts';
import { hasDestructiveChanges, summariseImpact, type ImpactRow } from './chartImpact.ts';
import type { SkillNode } from './types.ts';

function node(id: string, title: string): SkillNode {
  return {
    id, courseId: 'c', trackId: null, title, description: '',
    kind: 'topic', xpReward: 50, x: 0, y: 0, sortOrder: 0,
  };
}

const LIVE: ChartState = {
  nodes: [node('a', 'Describing data'), node('b', 'Midterm'), node('c', 'Final')],
  prereqs: [{ nodeId: 'b', prereqId: 'a' }, { nodeId: 'c', prereqId: 'b' }],
  missions: [],
};

const EMPTY: ChartChangeSet = {
  insertNodes: [], updateNodes: [], archiveNodes: [], restoreNodes: [],
  deletePrereqs: [], insertPrereqs: [], upsertMissions: [], deleteMissions: [],
};

test('a publish with no archives is not destructive', () => {
  assert.equal(hasDestructiveChanges({ ...EMPTY, updateNodes: [node('a', 'Renamed')] }), false);
  assert.equal(hasDestructiveChanges({ ...EMPTY, archiveNodes: ['b'] }), true);
  assert.equal(hasDestructiveChanges({ ...EMPTY, deleteMissions: ['m1'] }), true);
});

test('a node nobody has cleared reports zero impact, not a missing row', () => {
  const rows: ImpactRow[] = [
    { nodeId: 'b', studentsCompleted: 0, missionsHidden: 0, missionCompletions: 0, helpDescendants: 0 },
  ];
  const [impact] = summariseImpact({ ...EMPTY, archiveNodes: ['b'] }, LIVE, rows);

  assert.equal(impact?.studentsCompleted, 0);
  assert.equal(impact?.title, 'Midterm', 'the readout names the node, never its uuid');
});

test('archiving a node counts the edges it leaves dangling on both sides', () => {
  const rows: ImpactRow[] = [
    { nodeId: 'b', studentsCompleted: 7, missionsHidden: 3, missionCompletions: 12, helpDescendants: 2 },
  ];
  const [impact] = summariseImpact({ ...EMPTY, archiveNodes: ['b'] }, LIVE, rows);

  assert.equal(impact?.danglingEdges, 2, 'b requires a, and c requires b');
  assert.equal(impact?.studentsCompleted, 7);
  assert.equal(impact?.helpDescendants, 2);
});

test('a node with no impact row at all reads as zero rather than throwing', () => {
  const [impact] = summariseImpact({ ...EMPTY, archiveNodes: ['b'] }, LIVE, []);

  assert.equal(impact?.studentsCompleted, 0);
  assert.equal(impact?.missionsHidden, 0);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './chartImpact.ts'`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * What a publish will actually do to students, for the confirm step.
 *
 * The counts come from `chart_archive_impact`, which has no five-student
 * suppression floor — unlike `course_progress_summary`, which keeps its floor
 * because Class insights is built on it. This readout is a pre-flight check on
 * a destructive action by the owner of the data, which is a different question
 * from a published class statistic.
 *
 * Pure. The rows arrive as an argument.
 */

import type { ChartState } from './chartDraft.ts';
import type { ChartChangeSet } from './chartDiff.ts';

/** Exactly the shape `chart_archive_impact` returns, one row per node. */
export interface ImpactRow {
  nodeId: string;
  studentsCompleted: number;
  missionsHidden: number;
  missionCompletions: number;
  helpDescendants: number;
}

export interface ArchiveImpact extends ImpactRow {
  title: string;
  /** Edges naming this node from either end. They stop being drawn. */
  danglingEdges: number;
}

const ZERO = { studentsCompleted: 0, missionsHidden: 0, missionCompletions: 0, helpDescendants: 0 };

export function summariseImpact(
  set: ChartChangeSet,
  live: ChartState,
  rows: readonly ImpactRow[],
): ArchiveImpact[] {
  const byNode = new Map(rows.map((r) => [r.nodeId, r]));
  const titleOf = new Map(live.nodes.map((n) => [n.id, n.title]));

  return set.archiveNodes.map((nodeId) => ({
    ...ZERO,
    ...byNode.get(nodeId),
    nodeId,
    // Falling back to the id would print a uuid at the person deciding whether
    // to retire something. Name it or say so.
    title: titleOf.get(nodeId) ?? 'an unnamed node',
    danglingEdges: live.prereqs.filter((p) => p.nodeId === nodeId || p.prereqId === nodeId).length,
  }));
}

/** Anything a student could notice as a loss. Drives the confirm step. */
export const hasDestructiveChanges = (set: ChartChangeSet) =>
  set.archiveNodes.length > 0 || set.deleteMissions.length > 0 || set.deletePrereqs.length > 0;
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/skilltree/chartImpact.ts src/features/skilltree/chartImpact.test.ts
git commit -m "feat: summarise what a publish does to students"
```

---

## Task 7: The publish payload

**Files:**
- Create: `src/features/skilltree/publishChart.ts`
- Test: `src/features/skilltree/publishChart.test.ts`

**Interfaces:**
- Consumes: `ChartChangeSet` from `./chartDiff.ts`, `ImpactRow` from `./chartImpact.ts`
- Produces:
  - `buildPublishPayload(set: ChartChangeSet): PublishPayload` — pure, exported for testing
  - `publishChart(courseId: string, set: ChartChangeSet): Promise<PublishCounts>`
  - `fetchArchiveImpact(courseId: string, nodeIds: string[]): Promise<ImpactRow[]>`

The test imports only `buildPublishPayload`. The two async functions import `supabase` and are therefore never imported by a test — keep them in the same file but below the pure builder, and never let the test file reference them.

**Wait — that is not sufficient.** A test importing the module at all executes its top-level `import { supabase }`. So the builder lives in its own file:

- Create: `src/features/skilltree/publishPayload.ts` (pure, tested)
- Create: `src/features/skilltree/publishChart.ts` (the two Supabase calls, untested)
- Test: `src/features/skilltree/publishPayload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ChartChangeSet } from './chartDiff.ts';
import { buildPublishPayload } from './publishPayload.ts';
import type { Mission, SkillNode } from './types.ts';

const EMPTY: ChartChangeSet = {
  insertNodes: [], updateNodes: [], archiveNodes: [], restoreNodes: [],
  deletePrereqs: [], insertPrereqs: [], upsertMissions: [], deleteMissions: [],
};

function node(id: string, extra: Partial<SkillNode> = {}): SkillNode {
  return {
    id, courseId: 'c', trackId: null, title: id, description: '',
    kind: 'topic', xpReward: 50, x: 1, y: 2, sortOrder: 3, ...extra,
  };
}

test('every section is present as an array even when nothing changed', () => {
  const payload = buildPublishPayload(EMPTY);

  for (const key of [
    'insert_nodes', 'update_nodes', 'archive_nodes', 'restore_nodes',
    'delete_prereqs', 'insert_prereqs', 'upsert_missions', 'delete_missions',
  ]) {
    assert.ok(Array.isArray((payload as Record<string, unknown>)[key]), `${key} is an array`);
  }
});

test('an inserted node carries snake_case columns and no course_id', () => {
  const payload = buildPublishPayload({ ...EMPTY, insertNodes: [node('n1', { iconKey: 'pixel_flask' })] });

  assert.deepEqual(payload.insert_nodes, [{
    id: 'n1', title: 'n1', description: '', kind: 'topic', xp_reward: 50,
    icon_key: 'pixel_flask', x: 1, y: 2, sort_order: 3, title_override: null,
  }]);
});

test('a mission worth zero estimated minutes sends null, because the check is > 0', () => {
  const mission: Mission = {
    id: 'm1', skillId: 'n1', title: 'Read', description: '',
    kind: 'topic', xpReward: 10, estimatedMinutes: 0,
  };
  const payload = buildPublishPayload({ ...EMPTY, upsertMissions: [mission] });

  assert.equal(payload.upsert_missions[0]?.estimated_minutes, null);
  assert.equal(payload.upsert_missions[0]?.node_id, 'n1', 'skillId is node_id in the database');
});

test('an edge carries only its two endpoints, because a trigger fills course_id', () => {
  const payload = buildPublishPayload({ ...EMPTY, insertPrereqs: [{ nodeId: 'b', prereqId: 'a' }] });

  assert.deepEqual(payload.insert_prereqs, [{ node_id: 'b', prereq_id: 'a' }]);
});

test('a blank title override is sent as null, not as an empty string', () => {
  const payload = buildPublishPayload({
    ...EMPTY, updateNodes: [node('n1', { titleOverride: '   ' } as Partial<SkillNode>)],
  });

  assert.equal(payload.update_nodes[0]?.title_override, null);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './publishPayload.ts'`.

- [ ] **Step 3: Add `titleOverride` to `SkillNode`**

In `src/features/skilltree/types.ts`, beside the other naming fields:

```ts
  /**
   * A title the instructor typed by hand. `name-quest` skips any node where
   * this is set, so an edit here pins the name against regeneration.
   */
  titleOverride?: string | null;
```

Then map it in `fetchTree` — in `src/features/skilltree/queries.ts`, wherever the node row is mapped to a `SkillNode`, add `titleOverride: row.title_override`. The column is already in the select list at `queries.ts:62`.

- [ ] **Step 4: Write the payload builder**

```ts
/**
 * The JSON `publish_chart_changes` parses.
 *
 * Two rules the database enforces and this file has to respect. `course_id` is
 * never sent for an edge or a mission — the `sync_prereq_course` and
 * `sync_mission_course` triggers overwrite whatever arrives. And
 * `estimated_minutes` has a `> 0` check, so a zero has to become null rather
 * than travel as a zero and fail the insert.
 *
 * Pure, and deliberately in its own file: a test that imports the Supabase
 * client cannot run without credentials, and the whole suite is meant to.
 */

import type { ChartChangeSet } from './chartDiff.ts';
import type { Mission, SkillNode } from './types.ts';

export interface PublishPayload {
  insert_nodes: NodeRow[];
  update_nodes: NodeRow[];
  archive_nodes: { id: string }[];
  restore_nodes: { id: string }[];
  delete_prereqs: EdgeRow[];
  insert_prereqs: EdgeRow[];
  upsert_missions: MissionRow[];
  delete_missions: { id: string }[];
}

interface NodeRow {
  id: string;
  title: string;
  description: string;
  kind: string;
  xp_reward: number;
  icon_key: string | null;
  x: number;
  y: number;
  sort_order: number;
  title_override: string | null;
}

interface EdgeRow { node_id: string; prereq_id: string }

interface MissionRow {
  id: string;
  node_id: string;
  title: string;
  description: string;
  kind: string;
  xp_reward: number;
  estimated_minutes: number | null;
  sort_order: number;
}

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

const nodeRow = (n: SkillNode): NodeRow => ({
  id: n.id,
  title: n.title,
  description: n.description,
  kind: n.kind,
  xp_reward: n.xpReward,
  icon_key: n.iconKey ?? null,
  x: n.x,
  y: n.y,
  sort_order: n.sortOrder,
  title_override: blankToNull(n.titleOverride),
});

const missionRow = (m: Mission, index: number): MissionRow => ({
  id: m.id,
  node_id: m.skillId,
  title: m.title,
  description: m.description,
  kind: m.kind,
  xp_reward: m.xpReward,
  // 0 would fail `check (estimated_minutes > 0)` (0003:29).
  estimated_minutes: m.estimatedMinutes && m.estimatedMinutes > 0 ? m.estimatedMinutes : null,
  sort_order: index,
});

export function buildPublishPayload(set: ChartChangeSet): PublishPayload {
  return {
    insert_nodes: set.insertNodes.map(nodeRow),
    update_nodes: set.updateNodes.map(nodeRow),
    archive_nodes: set.archiveNodes.map((id) => ({ id })),
    restore_nodes: set.restoreNodes.map((id) => ({ id })),
    delete_prereqs: set.deletePrereqs.map((p) => ({ node_id: p.nodeId, prereq_id: p.prereqId })),
    insert_prereqs: set.insertPrereqs.map((p) => ({ node_id: p.nodeId, prereq_id: p.prereqId })),
    upsert_missions: set.upsertMissions.map(missionRow),
    delete_missions: set.deleteMissions.map((id) => ({ id })),
  };
}
```

- [ ] **Step 5: Write the two Supabase calls**

```ts
// src/features/skilltree/publishChart.ts
import { supabase } from '@/lib/supabase';

import type { ChartChangeSet } from './chartDiff';
import type { ImpactRow } from './chartImpact';
import { buildPublishPayload } from './publishPayload';

export interface PublishCounts {
  nodesInserted: number;
  nodesUpdated: number;
  nodesArchived: number;
  nodesRestored: number;
  prereqsDeleted: number;
  prereqsInserted: number;
  missionsUpserted: number;
  missionsDeleted: number;
}

/** Exact per-node counts for the confirm step. Owner-gated in the database. */
export async function fetchArchiveImpact(courseId: string, nodeIds: string[]): Promise<ImpactRow[]> {
  if (nodeIds.length === 0) return [];
  const { data, error } = await supabase.rpc('chart_archive_impact', {
    p_course_id: courseId,
    p_node_ids: nodeIds,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, number | string>) => ({
    nodeId: String(row.node_id),
    studentsCompleted: Number(row.students_completed),
    missionsHidden: Number(row.missions_hidden),
    missionCompletions: Number(row.mission_completions),
    helpDescendants: Number(row.help_descendants),
  }));
}

/**
 * One call, one transaction. The client cannot run a multi-statement
 * transaction, and a half-applied publish would leave the undo baseline
 * describing a chart that no longer exists.
 */
export async function publishChart(courseId: string, set: ChartChangeSet): Promise<PublishCounts> {
  const { data, error } = await supabase.rpc('publish_chart_changes', {
    p_course_id: courseId,
    p_changes: buildPublishPayload(set),
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) ?? {};
  return {
    nodesInserted: Number(row.nodes_inserted ?? 0),
    nodesUpdated: Number(row.nodes_updated ?? 0),
    nodesArchived: Number(row.nodes_archived ?? 0),
    nodesRestored: Number(row.nodes_restored ?? 0),
    prereqsDeleted: Number(row.prereqs_deleted ?? 0),
    prereqsInserted: Number(row.prereqs_inserted ?? 0),
    missionsUpserted: Number(row.missions_upserted ?? 0),
    missionsDeleted: Number(row.missions_deleted ?? 0),
  };
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npm test`
Expected: PASS. Confirm the count did not drop — `publishChart.ts` must not be picked up by the glob as a test, and no test may import it.

- [ ] **Step 7: Commit**

```bash
git add src/features/skilltree/publishPayload.ts src/features/skilltree/publishPayload.test.ts src/features/skilltree/publishChart.ts src/features/skilltree/types.ts src/features/skilltree/queries.ts
git commit -m "feat: build and send the publish payload"
```

---

## Task 8: The draft hook

**Files:**
- Create: `src/lib/useChartDraft.ts`

**Interfaces:**
- Consumes: `chartDraftStorageKey` (Task 3), the reducer (Task 4), `createStore` from `./store`
- Produces: `useChartDraft(courseId: string | undefined)` returning `{ draft, ready, edit, undoEdit, redoEdit, reset, canUndo, canRedo }` where `edit(op: ChartOp): Promise<void>` and `reset(state: ChartState): Promise<void>`

Untested by design, exactly like `nodeLayout.ts`, `questNames.ts`, and `signals.ts`. The logic worth testing is in Task 4.

- [ ] **Step 1: Write the hook**

```ts
/**
 * The instructor's chart draft, kept on the device.
 *
 * Storage and React live here; the rules live in `chartDraft.ts`, which stays
 * importable by `node --test`. Same split as `store.ts` and `nodeLayout.ts`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  applyOp, canRedo as canRedoDraft, canUndo as canUndoDraft, emptyDraft, redo, undo,
  type ChartDraft, type ChartOp, type ChartState,
} from '@/features/skilltree/chartDraft';

import { chartDraftStorageKey } from './chartDraftKey';
import { createStore } from './store';

const EMPTY_STATE: ChartState = { nodes: [], prereqs: [], missions: [] };
const EMPTY: ChartDraft = emptyDraft(EMPTY_STATE);

export function useChartDraft(courseId: string | undefined) {
  const store = useMemo(
    () =>
      courseId
        ? createStore<ChartDraft>(AsyncStorage, chartDraftStorageKey(courseId), 1, EMPTY)
        : null,
    [courseId],
  );

  const [draft, setDraft] = useState<ChartDraft>(EMPTY);
  const [ready, setReady] = useState(false);

  // Mutators fire in quick succession from canvas gestures, so they read the
  // latest draft from a ref rather than closing over a stale render.
  const latest = useRef(draft);
  latest.current = draft;

  useEffect(() => {
    let live = true;
    if (!store) {
      setDraft(EMPTY);
      setReady(true);
      return;
    }
    setReady(false);
    store.load().then((loaded) => {
      if (!live) return;
      setDraft(loaded);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [store]);

  const commit = useCallback(
    async (next: ChartDraft) => {
      setDraft(next);
      if (store) await store.save(next);
    },
    [store],
  );

  const edit = useCallback((op: ChartOp) => commit(applyOp(latest.current, op)), [commit]);
  const undoEdit = useCallback(() => commit(undo(latest.current)), [commit]);
  const redoEdit = useCallback(() => commit(redo(latest.current)), [commit]);

  /** Seed from a fresh server read. Discards the working copy and the stack. */
  const reset = useCallback((state: ChartState) => commit(emptyDraft(state)), [commit]);

  return {
    draft,
    ready,
    edit,
    undoEdit,
    redoEdit,
    reset,
    canUndo: canUndoDraft(draft),
    canRedo: canRedoDraft(draft),
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/useChartDraft.ts
git commit -m "feat: persist the instructor chart draft on the device"
```

---

## Task 9: Close the two cache leaks

**Files:**
- Modify: `src/features/skilltree/queries.ts:131`
- Modify: `src/lib/editedTree.ts:13-50`

**Interfaces:**
- Consumes: nothing new
- Produces: `useEditedTree` gains a second argument, `serverNodeIds: readonly string[] | undefined`. `app/tree/[courseId].tsx:145` must pass it.

Archived nodes disappear from students through RLS, but two client caches sit in front of that read and one of them wins outright.

- [ ] **Step 1: Filter missions by surviving nodes**

In `src/features/skilltree/queries.ts`, `nodeIds` already exists at `:120` and is applied to `masteredIds` at `:124`. Missions are selected by `course_id`, not by node, so a mission whose node is gone still arrives. At `:131`, before the `.map`, add the same filter:

```ts
    missions: (missionsRes.data ?? [])
      .filter((row) => nodeIds.has(row.node_id))
      .map((row) => ({
```

Keep the rest of the mapping exactly as it is.

- [ ] **Step 2: Drop a stale edited tree**

`app/tree/[courseId].tsx:183` reads `edited?.tree ?? data?.tree`, so a student's local edited tree shadows the server entirely and forever. A node archived on the server would stay on that student's chart for good. Change `useEditedTree` to discard a stored tree that names nodes the server no longer returns:

```ts
export function useEditedTree(
  courseId: string | undefined,
  serverNodeIds: readonly string[] | undefined,
) {
```

Inside the load `.then`, replace the plain parse with a freshness check:

```ts
      .then((raw) => {
        if (!live) return;
        const stored = raw ? (JSON.parse(raw) as EditedCourse) : null;
        // A local edit shadows the server read, so a stale one hides a node the
        // owner retired. If the server no longer knows every node this draft
        // names, the draft is describing a chart that no longer exists.
        if (stored && serverNodeIds) {
          const known = new Set(serverNodeIds);
          const orphaned = stored.tree.nodes.some((n) => !known.has(n.id) && !n.id.startsWith('local-'));
          if (orphaned) {
            AsyncStorage.removeItem(editedTreeKey(courseId!)).catch(() => {});
            setEdited(null);
            return;
          }
        }
        setEdited(stored);
      })
```

Add `serverNodeIds` to the effect's dependency array alongside `courseId`.

- [ ] **Step 3: Pass the server node ids**

In `app/tree/[courseId].tsx:145`:

```ts
  const { edited, save: saveEditedTree, clear: clearEditedTree } = useEditedTree(
    courseId,
    data?.tree.nodes.map((n) => n.id),
  );
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck`
Expected: all tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/skilltree/queries.ts src/lib/editedTree.ts "app/tree/[courseId].tsx"
git commit -m "fix: stop stale caches from resurrecting retired nodes"
```

---

## Task 10: LMS primitives — modal, danger button, field error

**Files:**
- Modify: `src/ui/lms.tsx`

**Interfaces:**
- Produces:
  - `LModal({ visible, title, children, onRequestClose }: { visible: boolean; title: string; children: React.ReactNode; onRequestClose: () => void })`
  - `LButton` gains `variant?: 'default' | 'primary' | 'quiet' | 'danger'`
  - `Field` gains `error?: string`

The kit has no modal, no dialog, and no destructive button. `CourseSelector.tsx:210` is the structural reference, but every token there is a student pixel token — take the shape, not the styling.

- [ ] **Step 1: Add `Modal` to the React Native import**

At `src/ui/lms.tsx:15-27`, add `Modal` to the existing import list.

- [ ] **Step 2: Add the `danger` variant to `LButton`**

Widen the prop type:

```ts
  variant?: 'default' | 'primary' | 'quiet' | 'danger';
```

And add the two styles beside the existing variant styles:

```ts
  buttonDanger: { backgroundColor: c.attention, borderColor: c.attention },
  buttonDangerLabel: { color: c.surface },
```

Wire them the same way `primary` is wired in the existing `variant ===` branches.

- [ ] **Step 3: Add `error` to `Field`**

```ts
}: { label: string; hint?: string; tall?: boolean; error?: string } & TextInputProps) {
```

Render it below the input, replacing the hint when present — an error and a hint competing for the same line is how a validation message gets missed:

```tsx
      {error ? (
        <LText variant="small" tone="attention">
          {error}
        </LText>
      ) : hint ? (
        <LText variant="small" tone="muted">
          {hint}
        </LText>
      ) : null}
```

And mark the input itself:

```tsx
        style={[styles.input, tall ? styles.inputTall : null, error ? styles.inputError : null, style]}
```

```ts
  inputError: { borderColor: c.attention },
```

- [ ] **Step 4: Add `LModal`**

```tsx
/**
 * The kit had no dialog. `CourseSelector.tsx:210` is the structure this copies —
 * backdrop, `accessibilityViewIsModal`, heading, right-aligned actions — but
 * every token here is an LMS token. That file draws in the student's pixel
 * grammar, and mixing the two is the one thing `CLAUDE.md` asks us not to do.
 */
export function LModal({
  visible,
  title,
  children,
  onRequestClose,
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onRequestClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.modalBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onRequestClose}
        />
        <View style={styles.modalCard} accessibilityViewIsModal accessibilityRole="alert">
          <LText variant="section">{title}</LText>
          {children}
        </View>
      </View>
    </Modal>
  );
}
```

Styles, with the scrim colour and shadow lifted from `app/instructor.tsx:1304-1317` so the workspace has one overlay treatment rather than two:

```ts
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(37,31,32,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: lms.space.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    gap: lms.space.md,
    padding: lms.space.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/lms.tsx
git commit -m "feat(lms): add a dialog, a danger button, and field errors"
```

---

## Task 11: Ownership reaches the instructor page

**Files:**
- Modify: `app/instructor.tsx:79-83`, `:270-277`, `:283-286`, `:374-384`

**Interfaces:**
- Produces: `CourseRow` gains `canEdit: boolean`. `TreeSection` gains a `canEdit: boolean` prop.

- [ ] **Step 1: Widen `CourseRow`**

```ts
interface CourseRow {
  id: string;
  title: string;
  term: string | null;
  /** True only for the signed-in owner. Publishing is owner-gated in RLS too. */
  canEdit: boolean;
}
```

- [ ] **Step 2: Select `owner_id` and derive the flag**

The query at `:270-277` returns `data ?? []` typed as `Promise<CourseRow[]>`, so it must now map rather than pass through:

```ts
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
```

- [ ] **Step 3: Mark the demo fixture read-only**

At `:285` — the example chart is not a real course and must never be publishable:

```ts
    { id: DEMO_COURSE_ID, title: DEMO_COURSE_TITLE, term: 'Example chart', canEdit: false },
```

- [ ] **Step 4: Pass it to `TreeSection`**

Add `canEdit={course.canEdit}` to the `<TreeSection ... />` at `:374-384`, and add `canEdit: boolean;` to its props type at `:607-623`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: no errors. If any other `CourseRow` literal appears, the compiler will name it.

- [ ] **Step 6: Commit**

```bash
git add app/instructor.tsx
git commit -m "feat(instructor): know which courses the signed-in user owns"
```

---

## Task 12: The editable inspector

**Files:**
- Modify: `app/instructor.tsx` — `TreeSection` body and styles at `:1333-1346`

**Interfaces:**
- Consumes: `useChartDraft` (Task 8), `LModal`/`Field`/`LButton` (Task 10), `resolveName` from `@/features/skilltree/naming`
- Produces: a `NodeEditor` component local to `app/instructor.tsx`

- [ ] **Step 1: Make the rail able to hold a form**

At `:1340-1345`, `inspectorWide` is `width: 300` with no `flex` and no scrolling — a form overflows with no way to reach its bottom:

```ts
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
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: c.line,
  },
```

Wrap the existing inspector contents in `<ScrollView contentContainerStyle={styles.inspectorScroll}>`. `ScrollView` is already imported in this file.

- [ ] **Step 2: Read the live node, never the stale selection**

`selected` holds a node *object* captured at click time (`:624`) and is never re-derived, so after a publish-and-refetch it is a stale copy. Add, after the query:

```ts
  // `selected` is a snapshot from the moment of the click. Everything below
  // reads the live row so an edit is never applied to a pre-publish copy.
  const live = data?.tree.nodes.find((n) => n.id === selected?.id) ?? null;
```

Use `live` in place of `selected` everywhere in the inspector body except the `selected ?` presence check.

- [ ] **Step 3: Add the editor component**

Place it beside `Figure` near `:1188`:

```tsx
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
```

Add `questTitle?: string | null` to `SkillNode` in `src/features/skilltree/types.ts` if it is not already there, and map `questTitle: row.quest_title` in `queries.ts` — the column is already selected at `queries.ts:62`.

- [ ] **Step 4: Show it when the user owns the course**

In the inspector, replace the read-only block with a mode switch. The `Edit` button appears only when `canEdit`:

```tsx
      {live ? (
        editing ? (
          <NodeEditor
            node={live}
            onCancel={() => setEditing(false)}
            onSave={(patch) => {
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
            }}
          />
        ) : (
          <>
            {/* the three existing read-only blocks at instructor.tsx:634-659,
                unchanged: title + badges, the Figure pair, the description */}
            {canEdit ? (
              <LButton label="Edit this node" icon="edit-3" onPress={() => setEditing(true)} />
            ) : null}
          </>
        )
      ) : (
        /* the existing empty state, unchanged */
      )}
```

Add `const [editing, setEditing] = useState(false);` beside the existing `selected` state, and reset it to `false` whenever `selected?.id` changes.

- [ ] **Step 5: Verify in the running app**

```bash
npm run web
playwright-cli open http://localhost:8081
playwright-cli find "Continue as demo student"
```

Then sign in, open `/instructor`, choose Skill tree, click a node, and confirm the **Edit this node** button does *not* appear — the demo course has `canEdit: false`. Screenshot it.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/instructor.tsx src/features/skilltree/types.ts src/features/skilltree/queries.ts
git commit -m "feat(instructor): edit a node from the inspector"
```

---

## Task 13: Canvas edit mode

**Files:**
- Modify: `app/instructor.tsx` — `TreeSection`

**Interfaces:**
- Consumes: `useChartDraft` (Task 8), `validateGraph` and `slugId` from `@/features/skilltree/validation`
- Produces: the draft-backed tree that `SkillTree` renders in the instructor canvas

`SkillTree` accepts the edit props but owns no edit state: `onDeleteNode` gets no node id, `onAddNode` reports only a coordinate, and the link target arrives through `onSelectNode`. This task builds that state machine.

- [ ] **Step 1: Seed the draft from the server read**

```ts
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
```

- [ ] **Step 2: Render the draft when editing, the server tree otherwise**

```ts
  const shown = editMode && canEdit
    ? { nodes: draft.working.nodes.filter((n) => !n.archived), prereqs: draft.working.prereqs }
    : data.tree;
```

Pass `tree={shown}` to `SkillTree` in place of `data.tree`.

- [ ] **Step 3: Add the edit state and the handlers**

```ts
  const [editMode, setEditMode] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  const notice = (text: string) => {
    setLinkNotice(text);
    setTimeout(() => setLinkNotice(null), 2400);
  };

  const addNode = (at: { x: number; y: number }) => {
    const id = crypto.randomUUID();
    edit({
      t: 'add',
      node: {
        id,
        courseId: course.id,
        trackId: null,
        title: 'New node',
        description: '',
        kind: 'topic',
        xpReward: 50,
        x: at.x,
        y: at.y,
        sortOrder: draft.working.nodes.length,
      },
    });
    setSelected({ ...draft.working.nodes[0]!, id } as SkillNode);
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
```

`validateGraph(nodes, prereqs)` returns `GraphValidation` — `{ isValid: boolean; errors: GraphError[] }`, where each error is `{ type, message }` (`validation.ts:30`). It is `isValid`, not `ok`, and errors carry a `.message`. `app/author.tsx:117` is the working call site.

- [ ] **Step 4: Wire the props**

```tsx
        editMode={editMode}
        linkMode={linkMode}
        linkSourceId={linkSourceId}
        linkNotice={linkNotice}
        onToggleEditMode={canEdit ? (next) => { setEditMode(next); if (!next) cancelLink(); } : undefined}
        onAddNode={canEdit ? addNode : undefined}
        onToggleLinkMode={canEdit ? startLink : undefined}
        onCancelLink={canEdit ? cancelLink : undefined}
        onDeleteNode={canEdit ? archiveSelected : undefined}
        positions={undefined}
        onMoveNode={canEdit ? moveNode : undefined}
        onSelectNode={selectNode}
```

Two things that matter here. Passing `onToggleEditMode={undefined}` is what keeps a non-owner out — `ChartTools` renders no pencil at all without it (`ChartTools.tsx:56`), so there is no entry point rather than a disabled one. And `positions` stays `undefined` on purpose: `useNodeLayout` is a device-local arrangement of someone else's chart (`nodeLayout.ts:1-13`), and an instructor's move is a real coordinate that publishes.

- [ ] **Step 5: Verify in the app**

Run the app, sign in as an owner of a real Supabase course, open Skill tree, and confirm: the pencil appears, edit mode shows the toolbar, a node can be dragged, CONNECT links two nodes, and a self-link is refused with "A node cannot require itself". Screenshot each.

On the demo course, confirm no pencil appears at all.

- [ ] **Step 6: Commit**

```bash
git add app/instructor.tsx
git commit -m "feat(instructor): edit the chart on the canvas"
```

---

## Task 14: Change tray, publish, and undo

**Files:**
- Modify: `app/instructor.tsx` — `TreeSection`

**Interfaces:**
- Consumes: `diffCharts`/`countChanges` (Task 5), `summariseImpact`/`hasDestructiveChanges` (Task 6), `publishChart`/`fetchArchiveImpact` (Task 7), `LModal` (Task 10)
- Produces: nothing downstream

- [ ] **Step 1: Compute the change set**

```ts
  const liveState = useMemo(
    () => ({ nodes: data?.tree.nodes ?? [], prereqs: data?.tree.prereqs ?? [], missions: data?.missions ?? [] }),
    [data],
  );
  const changes = useMemo(() => diffCharts(liveState, draft.working), [liveState, draft.working]);
  const validation = useMemo(
    () => validateGraph(draft.working.nodes.filter((n) => !n.archived), draft.working.prereqs),
    [draft.working],
  );
```

- [ ] **Step 2: Add the tray to the toolbar**

The toolbar at `:676-688` already has a `styles.spacer`. Add before the existing buttons:

```tsx
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
```

- [ ] **Step 3: Add the confirm flow**

```ts
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
```

`queryClient` comes from `useQueryClient()` — add the import from `@tanstack/react-query`.

- [ ] **Step 4: Render the dialog**

```tsx
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
```

Mount it as a sibling of the page shell rather than inside `TreeSection`'s layout — anything absolutely positioned inside the section renders *below* the nav drawer, which is a later sibling of `styles.main` (`:419`).

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test`
Expected: no errors, all tests pass.

Against a real Supabase course: rename a node, archive another, publish, and confirm the counts returned match what changed and the chart refetches. Reload the student view and confirm the archived node is gone. Then restore it from the draft and confirm the student's completion of it is intact.

If no credentialed project is available, record the UI verification with `playwright-cli` and state plainly that the publish path is unverified.

- [ ] **Step 6: Commit**

```bash
git add app/instructor.tsx
git commit -m "feat(instructor): publish chart changes in one transaction"
```

---

## Task 15: The narrow-screen editor

**Files:**
- Modify: `app/instructor.tsx` — `TreeSection`, styles

Below `lms.wide` (860px) the tree renders *outside* the page's `ScrollView` on purpose (`:371`: *"the canvas is a map, and a map inside a scroll view is a map you cannot pan"*). A form stacked under it squeezes the canvas to its 360px floor and then clips, with no scroll recovery and no `KeyboardAvoidingView` in the file.

- [ ] **Step 1: Extract the inspector into a component**

Task 12 built the inspector inline as `const inspector = (...)`. Lift it to a module-local component so both presentations render the same thing. Place it beside `NodeEditor`:

```tsx
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
```

This is the same content Task 12 produced, with the surrounding `View`/`ScrollView` left to the caller so the two presentations can wrap it differently.

- [ ] **Step 2: Render it in the rail when wide, in a sheet when narrow**

```tsx
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
    <View style={[styles.canvasLayout, wide ? styles.canvasLayoutWide : null]}>
      <View style={styles.canvasColumn}>{/* toolbar, error, skeleton, stage — unchanged */}</View>

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
  );
```

`saveNodePatch` is the handler Task 12 wired into `onSave` — lift it out of the inline JSX into a named function on the same body:

```tsx
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
```

Import `KeyboardAvoidingView` and `Platform` from `react-native` in `app/instructor.tsx`.

- [ ] **Step 3: Verify at both widths**

```bash
playwright-cli resize 1440 900
playwright-cli screenshot
playwright-cli resize 720 900
playwright-cli screenshot
```

Expected: at 1440 the form sits in the right rail and scrolls; at 720 tapping a node opens a sheet over the canvas, and the canvas is never squeezed below its minimum.

- [ ] **Step 4: Commit**

```bash
git add app/instructor.tsx
git commit -m "feat(instructor): edit nodes in a sheet on narrow screens"
```

---

## Task 16: Undo a publish

**Files:**
- Modify: `app/instructor.tsx` — `TreeSection`
- Modify: `src/lib/useChartDraft.ts` — keep the last published baseline

**Interfaces:**
- Consumes: `diffCharts` (Task 5), `publishChart` (Task 7)
- Produces: nothing downstream

A publish is reversible because nothing it does is destructive: archiving is a flag, node uuids are stable, and edges are re-insertable. The inverse of a change set is the diff taken the other way round.

- [ ] **Step 1: Keep the pre-publish state**

Add a field to `ChartDraft` in `src/features/skilltree/chartDraft.ts`:

```ts
  /**
   * The chart as it stood immediately before the last publish, or null if
   * nothing has been published from this draft. Undoing a publish is a publish
   * of the diff taken the other way round.
   */
  published: ChartState | null;
```

Set `published: null` in `emptyDraft`, and carry it through `applyOp`, `undo`, and `redo` unchanged — those three already spread `...draft`, so no change is needed beyond the initialiser.

Add a mutator to `useChartDraft`:

```ts
  const markPublished = useCallback(
    (before: ChartState, after: ChartState) =>
      commit({ ...emptyDraft(after), published: before }),
    [commit],
  );
```

Export it from the hook's return object.

- [ ] **Step 2: Record the baseline on publish**

In `doPublish` (Task 14), replace the `reset(...)` call with:

```ts
      const before = draft.baseline;
      await publishChart(course.id, changes);
      await purgeCourseCache(course.id);
      const after = await fetchTree(course.id);
      markPublished(before, {
        nodes: after.tree.nodes,
        prereqs: after.tree.prereqs,
        missions: after.missions,
      });
```

- [ ] **Step 3: Offer the undo**

In the toolbar, beside the change tray:

```tsx
          {canEdit && draft.published && countChanges(changes) === 0 ? (
            <LButton
              label="Undo publish"
              icon="rotate-ccw"
              size="sm"
              onPress={undoPublish}
            />
          ) : null}
```

It appears only when there are no unpublished edits — an undo on top of a half-made new draft would publish both at once.

```ts
  const undoPublish = async () => {
    if (!draft.published) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const current = await fetchTree(course.id);
      const inverse = diffCharts(
        { nodes: current.tree.nodes, prereqs: current.tree.prereqs, missions: current.missions },
        draft.published,
      );
      await publishChart(course.id, inverse);
      await purgeCourseCache(course.id);
      const after = await fetchTree(course.id);
      markPublished(after, {
        nodes: after.tree.nodes,
        prereqs: after.tree.prereqs,
        missions: after.missions,
      });
      await refetch();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'The undo did not go through.');
    } finally {
      setPublishing(false);
    }
  };
```

Note what the inverse does and does not do. A node the publish *added* comes back as an archive, not a removal — publish never deletes a node, by design, so undoing an addition retires it rather than erasing it. Archives, renames, re-prices, moves, and edges all invert exactly, and student records were never touched.

- [ ] **Step 4: Warn about the one thing undo cannot restore**

Mission deletion is the only genuinely destructive operation left in a publish: `mission_progress.mission_id` cascades (`0003:52`), so a deleted mission takes every student's completion of it. Re-inserting the mission with its original id brings back the mission, not the completions.

Add to the confirm dialog in Task 14, above the action row:

```tsx
        {changes.deleteMissions.length > 0 ? (
          <Notice tone="error" title="Deleting missions cannot be undone">
            {changes.deleteMissions.length} mission
            {changes.deleteMissions.length === 1 ? '' : 's'} will be removed. Every student's record
            of completing them goes with it, and Undo publish cannot bring those records back.
            Retiring the whole node instead keeps them.
          </Notice>
        ) : null}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test`

Against a credentialed project: archive a node, publish, confirm the student loses sight of it, press **Undo publish**, and confirm the node returns *with* the student's completion of it intact.

- [ ] **Step 6: Commit**

```bash
git add app/instructor.tsx src/lib/useChartDraft.ts src/features/skilltree/chartDraft.ts
git commit -m "feat(instructor): undo a publish"
```

---

## Verification checklist

Run before calling the feature done:

```bash
npm test          # every pure module, no credentials needed
npm run typecheck # tsc --noEmit
npm run lint      # expo lint
npm run db:reset  # both migrations apply (needs Docker)
```

Then, against a credentialed project: rename, add, link, move, archive, publish, restore. Confirm a student's chart reflects each change and that a restored node brings back the student's completion of it.

## Known gaps

- The migrations, the six rewritten functions, `chart_archive_impact`, and `publish_chart_changes` cannot be verified without either Docker (local stack) or real Supabase credentials. Everything above the RPC boundary can be, and is.
- Mission editing is reachable through the `mission` op in the draft reducer and the `upsert_missions` / `delete_missions` sections of the payload, but no UI in this plan writes it. The plumbing is complete and tested; the form is a follow-up.
- **Mission deletion is the one destructive operation left.** `mission_progress.mission_id` cascades (`0003:52`), so removing a mission removes every student's record of completing it, and Undo publish cannot restore those records — it restores the mission, not the completions. Task 16 warns about this in the confirm dialog. The consistent fix is to give `missions` an `archived` column of its own and treat removal the same way node retirement is treated; that was not in the approved spec, and it is the obvious next change if mission editing gets a UI.
- Undoing a publish that *added* a node retires that node rather than erasing it, because publish never deletes a node. The chart returns to its previous shape; the added node lingers as archived.
