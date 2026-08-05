-- Extra help re-prices a node's missions, not just the node.
--
-- 0002 shipped request_help_subtree() before missions existed. Its conservation
-- check compares the parent's own xp_reward against the steps it is handing XP
-- to, which was complete at the time. 0003 added missions, and with them a
-- second place a node's worth is written down.
--
-- That gap is an XP faucet, not a rounding error. A student's XP is derived
-- from the missions they have completed, so grafting a help subtree onto a node
-- that has missions used to drop the node's xp_reward column while leaving
-- every mission paying its original amount. Finish the scaffold and the
-- original missions and you bank the node's full value plus HELP_SHARE of it
-- again.
--
-- The rule this migration enforces, matching planFragmentation() in
-- src/features/skilltree/missions.ts:
--
--   * The node has missions  -> the missions are re-priced, they must still sum
--                               to what they summed to before minus the steps,
--                               and xp_reward is set to that new sum.
--   * The node has none      -> unchanged from 0002: the column is the total.
--
-- The signature gains an argument, so the old function is dropped rather than
-- replaced: `create or replace` with a different argument list creates an
-- overload, and leaving the four-argument version callable would leave the hole
-- open.

drop function if exists request_help_subtree(uuid, integer, jsonb, jsonb, text);

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
  where n.id = p_node_id and n.parent_node_id is null and n.course_id is not null;
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

-- This one writes, so its reach is spelled out rather than left to the default
-- grant. A signed-out caller has no auth.uid() and would fail the enrolment
-- check anyway; saying so here means that is not the only thing standing
-- between an anonymous request and an insert.
revoke execute on function request_help_subtree(uuid, integer, jsonb, jsonb, jsonb, text)
  from public, anon;
grant execute on function request_help_subtree(uuid, integer, jsonb, jsonb, jsonb, text)
  to authenticated;
