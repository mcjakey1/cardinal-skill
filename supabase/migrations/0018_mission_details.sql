-- Mission detail editing. Course content remains owner-authored; student progress is untouched.

alter table missions
  add column difficulty text
  check (difficulty is null or difficulty in ('easy', 'medium', 'hard'));

create or replace function update_course_mission(
  p_mission_id uuid,
  p_title text,
  p_description text,
  p_xp_reward integer,
  p_estimated_minutes integer,
  p_difficulty text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_node_id uuid;
  v_course_id uuid;
begin
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Mission title is required.';
  end if;
  if p_xp_reward < 10 or p_xp_reward > 100 then
    raise exception 'Mission XP must be between 10 and 100.';
  end if;
  if p_estimated_minutes < 1 or p_estimated_minutes > 600 then
    raise exception 'Estimated time must be between 1 and 600 minutes.';
  end if;
  if p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'Difficulty must be easy, medium, or hard.';
  end if;

  select m.node_id, m.course_id into v_node_id, v_course_id
  from missions m where m.id = p_mission_id;

  if v_node_id is null or not owns_course(v_course_id) then
    raise exception 'Only the course owner can edit this mission.' using errcode = '42501';
  end if;

  -- Serialize sibling mission edits before recomputing their shared XP cache.
  perform 1 from skill_nodes where id = v_node_id for update;

  update missions set
    title = trim(p_title),
    description = trim(coalesce(p_description, '')),
    xp_reward = p_xp_reward,
    estimated_minutes = p_estimated_minutes,
    difficulty = p_difficulty
  where id = p_mission_id;

  update skill_nodes set xp_reward = (
    select coalesce(sum(m.xp_reward), 0)::integer from missions m where m.node_id = v_node_id
  ) where id = v_node_id;
end;
$$;

revoke all on function update_course_mission(uuid, text, text, integer, integer, text) from public;
grant execute on function update_course_mission(uuid, text, text, integer, integer, text) to authenticated;
