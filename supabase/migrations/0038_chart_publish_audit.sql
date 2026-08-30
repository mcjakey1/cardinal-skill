-- One row per chart publish, and only when the chart actually moved.
--
-- 0037 puts a trigger on `courses` and one on `enrollments`, because the writes
-- it had to catch were plain table writes with no function to sit inside. A
-- chart publish is the opposite case. `publish_chart_changes` spreads its work
-- over `skill_nodes`, `node_prereqs` and `missions`, and row triggers on those
-- three would record a hundred rows for one act. The event a reader cares about
-- is the publish, and there is exactly one function that performs it — so the
-- log line goes inside it, the way 0036's four writers do.
--
-- The body below is 0015's, copied unchanged. The only additions are the block
-- immediately before `return next` and the `get diagnostics` after step 10 that
-- feeds it, and a diff against 0015 should show nothing else. It is its own migration because a 200-line function being re-declared
-- for a two-line change is a diff worth reading on its own.
--
-- WHAT IT DOES NOT CATCH. `owns_course` was widened by 0028 to pass an
-- administrator, so this function is reachable by one, and the role is taken
-- from who actually owns the course rather than from who was allowed in. A
-- direct write to `skill_nodes` under 0013's owner policies is still not
-- recorded; 0037 states that gap and the upgrade path for it. What does surface
-- is the XP drift such a write leaves behind, because step 10's repair is
-- counted below: the next publish is an event even when the batch was empty.

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
  v_xp_repaired integer := 0;
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
  -- into this course by the `on conflict (id) do update set node_id` below,
  -- carrying its mission_progress rows with it. node_id being valid is not
  -- enough; the mission's current home has to be this course too.
  if exists (
    select 1 from jsonb_array_elements(p_changes -> 'upsert_missions') m
    join missions old on old.id = (m ->> 'id')::uuid
    where old.course_id is distinct from p_course_id
  ) then
    raise exception 'a publish can only touch missions on this course';
  end if;

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
  update skill_nodes n set
    title          = coalesce(u ->> 'title', n.title),
    description    = coalesce(u ->> 'description', n.description),
    kind           = coalesce((u ->> 'kind')::node_kind, n.kind),
    -- xp_reward is authored data only while a node has no missions. The moment
    -- it has any, its XP is the sum of them (asserted by request_help_subtree,
    -- 0004:137-140) and step 10 settles it. Writing it here for a node with
    -- missions would be overwritten in the same transaction, which is exactly
    -- the silent no-op this clause exists to stop.
    xp_reward      = case
                       when exists (select 1 from missions m where m.node_id = n.id)
                         then n.xp_reward
                       else coalesce((u ->> 'xp_reward')::integer, n.xp_reward)
                     end,
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
  -- request_help_subtree at 0004:137-140. Every node in the course that has
  -- missions and is currently out of step, not only the ones this batch
  -- touched — the subquery filters on course_id alone. That is deliberate: it
  -- repairs drift from any source in the same pass, and the `xp_reward <>
  -- s.total` guard means an already-correct node is not rewritten. A node with
  -- no missions is never joined, so it keeps its own authored value.
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
  -- Counted, and deliberately not returned. A publish whose only effect is this
  -- repair moved the XP a student sees, so it is an event; leaving it out of
  -- the eight would let the guard below call it nothing. It stays out of the
  -- returned table because the editor reads that shape.
  get diagnostics v_n = row_count; v_xp_repaired := v_n;

  -- 11. The record. A publish that changed nothing is not an event: the
  -- editor sends whatever the canvas holds, so an instructor who opens a
  -- chart and presses Publish without touching it would otherwise write a row
  -- saying the tree moved.
  if nodes_inserted + nodes_updated + nodes_archived + nodes_restored
     + prereqs_deleted + prereqs_inserted + missions_upserted + missions_deleted
     + v_xp_repaired > 0 then
    perform public.write_admin_audit(
      'chart.published', null, p_course_id,
      jsonb_build_object(
        'nodes_inserted',    nodes_inserted,
        'nodes_updated',     nodes_updated,
        'nodes_archived',    nodes_archived,
        'nodes_restored',    nodes_restored,
        'prereqs_deleted',   prereqs_deleted,
        'prereqs_inserted',  prereqs_inserted,
        'missions_upserted', missions_upserted,
        'missions_deleted',  missions_deleted,
        'xp_repaired',       v_xp_repaired
      ),
      case
        when exists (
          select 1 from public.courses c
          where c.id = p_course_id and c.owner_id = auth.uid()
        ) then 'owner'
        else 'administrator'
      end);
  end if;

  return next;
end;
$$;

revoke all on function public.publish_chart_changes(uuid, jsonb) from public, anon;
grant execute on function public.publish_chart_changes(uuid, jsonb) to authenticated;
