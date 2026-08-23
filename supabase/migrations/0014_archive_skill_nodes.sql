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

create or replace function request_help_subtree(
  p_node_id       uuid,
  p_parent_reward integer,
  -- [{id,title,description,kind,xp_reward,x,y,sort_order}]
  p_steps         jsonb,
  -- [{node_id,prereq_id}]
  p_prereqs       jsonb,
  -- [{id,xp_reward}] — the node's missions at their new prices. Empty for a
  -- node with no missions.
  p_missions      jsonb default '[]'::jsonb,
  p_reason        text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_course_id      uuid;
  v_old_xp         integer;
  v_is_owner       boolean;
  v_steps_xp       integer;
  v_count          integer;
  v_request        uuid;
  v_mission_count  integer;
  v_old_missions   integer;
  v_new_missions   integer;
  v_old_total      integer;
  v_new_parent     integer;
begin
  if p_steps is null or jsonb_typeof(p_steps) <> 'array'
     or p_prereqs is null or jsonb_typeof(p_prereqs) <> 'array'
     or p_missions is null or jsonb_typeof(p_missions) <> 'array' then
    raise exception 'steps, prereqs and missions must all be JSON arrays';
  end if;

  -- The parent must be a real syllabus node, not another help step: nesting a
  -- scaffold under a scaffold fragments an already-fragmented reward.
  select n.course_id, n.xp_reward into v_course_id, v_old_xp
  from skill_nodes n
  where n.id = p_node_id and n.parent_node_id is null and n.course_id is not null
    and not n.archived;
  if v_course_id is null then
    raise exception 'that node is not one help can be added to';
  end if;

  select (c.owner_id = auth.uid()) into v_is_owner from courses c where c.id = v_course_id;
  if not coalesce(v_is_owner, false)
     and not exists (select 1 from enrollments e
                     where e.course_id = v_course_id and e.user_id = auth.uid()) then
    raise exception 'you are not on that course';
  end if;

  v_count := jsonb_array_length(p_steps);
  if v_count < 2 or v_count > 5 then
    raise exception 'a help subtree is 2 to 5 steps, not %', v_count;
  end if;

  -- Every edge must stay inside this subtree. Without this the caller could
  -- hand over an edge naming any node in any course and this definer function
  -- would happily write it.
  if exists (
    select 1 from jsonb_array_elements(p_prereqs) e
    where not exists (select 1 from jsonb_array_elements(p_steps) s
                      where (s->>'id')::uuid = (e->>'prereq_id')::uuid)
       or ((e->>'node_id')::uuid <> p_node_id
           and not exists (select 1 from jsonb_array_elements(p_steps) s
                           where (s->>'id')::uuid = (e->>'node_id')::uuid))
  ) then
    raise exception 'a help edge must stay inside the subtree';
  end if;

  select coalesce(sum((s->>'xp_reward')::integer), 0) into v_steps_xp
  from jsonb_array_elements(p_steps) s;

  select count(*)::integer into v_mission_count from missions m where m.node_id = p_node_id;

  -- Same reason the edges are checked above: without this, a caller could
  -- re-price any mission in any course through this definer function.
  if exists (
    select 1 from jsonb_array_elements(p_missions) x
    where not exists (
      select 1 from missions m where m.id = (x->>'id')::uuid and m.node_id = p_node_id
    )
  ) then
    raise exception 'a re-priced mission must belong to the node being scaffolded';
  end if;

  if v_mission_count > 0 then
    -- Partial re-pricing would silently leave some missions at the old price,
    -- which is the same faucet in a smaller form.
    if jsonb_array_length(p_missions) <> v_mission_count then
      raise exception 'all % missions on that node must be re-priced, got %',
        v_mission_count, jsonb_array_length(p_missions);
    end if;

    select coalesce(sum(m.xp_reward), 0) into v_old_missions
    from missions m where m.node_id = p_node_id;

    select coalesce(sum((x->>'xp_reward')::integer), 0) into v_new_missions
    from jsonb_array_elements(p_missions) x;

    if exists (select 1 from jsonb_array_elements(p_missions) x
               where (x->>'xp_reward')::integer < 0) then
      raise exception 'a mission cannot be worth less than nothing';
    end if;

    v_old_total  := v_old_missions;
    v_new_parent := v_new_missions;

    -- The column is a cache of the mission sum. Letting the two drift is what
    -- makes the chart and the record report different totals for one node.
    if p_parent_reward is null or p_parent_reward <> v_new_missions then
      raise exception 'xp_reward must equal what the missions are worth (% <> %)',
        p_parent_reward, v_new_missions;
    end if;
  else
    if jsonb_array_length(p_missions) > 0 then
      raise exception 'that node has no missions to re-price';
    end if;
    v_old_total  := v_old_xp;
    v_new_parent := p_parent_reward;
  end if;

  -- The conservation invariant from src/features/skilltree/missions.ts,
  -- asserted in the database. The null arm matters: without it a missing
  -- p_parent_reward makes the comparison null, and a null `if` is a silently
  -- passed check.
  if v_new_parent is null or v_new_parent + v_steps_xp <> v_old_total then
    raise exception 'help redistributes XP, it never mints it (% + % <> %)',
      v_new_parent, v_steps_xp, v_old_total;
  end if;

  insert into skill_nodes (id, course_id, title, description, kind, xp_reward,
                           x, y, sort_order, parent_node_id, graded)
  select (s->>'id')::uuid, v_course_id, s->>'title', s->>'description',
         (s->>'kind')::node_kind, (s->>'xp_reward')::integer,
         (s->>'x')::double precision, (s->>'y')::double precision,
         (s->>'sort_order')::integer, p_node_id, false
  from jsonb_array_elements(p_steps) s;

  -- course_id is filled in by the node_prereqs_sync_course trigger from 0001.
  insert into node_prereqs (node_id, prereq_id)
  select (e->>'node_id')::uuid, (e->>'prereq_id')::uuid
  from jsonb_array_elements(p_prereqs) e;

  update missions m
  set xp_reward = (x->>'xp_reward')::integer
  from jsonb_array_elements(p_missions) x
  where m.id = (x->>'id')::uuid;

  update skill_nodes set xp_reward = v_new_parent where id = p_node_id;

  insert into help_requests (course_id, node_id, requested_by, requester, reason)
  values (v_course_id, p_node_id, auth.uid(),
          -- Derived here, never taken from the request body: a student cannot
          -- log their request as though the instructor made it.
          case when v_is_owner then 'instructor' else 'student' end,
          nullif(btrim(coalesce(p_reason, '')), ''))
  returning id into v_request;

  return v_request;
end;
$$;

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
