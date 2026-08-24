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
