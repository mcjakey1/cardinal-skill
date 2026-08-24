-- Course-library order belongs to the viewer, not to the shared course. An
-- enrolled student's drag order must never reorder the owner's library.
create table public.course_preferences (
  user_id    uuid not null references auth.users on delete cascade,
  course_id  uuid not null references public.courses on delete cascade,
  sort_order integer not null check (sort_order >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create index course_preferences_user_order_idx
  on public.course_preferences (user_id, sort_order);

alter table public.course_preferences enable row level security;

create policy "manage own course preferences" on public.course_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Fork a readable course as one atomic graph copy. Progress, help requests,
-- enrolments, uploaded syllabus bytes, and XP events deliberately do not move.
create or replace function public.fork_course(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id       uuid := auth.uid();
  v_new_course_id uuid := gen_random_uuid();
  v_new_node_id   uuid;
  v_source_owner  boolean;
  v_old_ids       uuid[] := array[]::uuid[];
  v_new_ids       uuid[] := array[]::uuid[];
  v_node           record;
  v_index          integer;
begin
  if v_user_id is null then
    raise exception 'sign in before duplicating a course';
  end if;

  select c.owner_id = v_user_id into v_source_owner
  from public.courses c
  where c.id = p_course_id
    and (
      c.owner_id = v_user_id
      or exists (
        select 1 from public.enrollments e
        where e.course_id = c.id and e.user_id = v_user_id
      )
    );

  if v_source_owner is null then
    raise exception 'that course is not available to duplicate';
  end if;

  insert into public.courses (
    id, owner_id, title, term, syllabus_path, course_code, description, units
  )
  select
    v_new_course_id,
    v_user_id,
    left(c.title || ' Copy', 160),
    c.term,
    null,
    c.course_code,
    c.description,
    c.units
  from public.courses c
  where c.id = p_course_id;

  for v_node in
    select n.*
    from public.skill_nodes n
    where n.course_id = p_course_id
      and (v_source_owner or not n.archived)
    order by n.sort_order, n.created_at, n.id
  loop
    v_new_node_id := gen_random_uuid();
    v_old_ids := array_append(v_old_ids, v_node.id);
    v_new_ids := array_append(v_new_ids, v_new_node_id);

    insert into public.skill_nodes (
      id, course_id, track_id, title, description, kind, xp_reward,
      x, y, sort_order, parent_node_id, graded,
      quest_title, quest_subtitle, achievement_title,
      achievement_description, title_override, icon_key,
      syllabus_topic, universal_skill, learning_objectives, archived
    ) values (
      v_new_node_id, v_new_course_id, null, v_node.title, v_node.description,
      v_node.kind, v_node.xp_reward, v_node.x, v_node.y, v_node.sort_order,
      null, v_node.graded, v_node.quest_title, v_node.quest_subtitle,
      v_node.achievement_title, v_node.achievement_description,
      v_node.title_override, v_node.icon_key, v_node.syllabus_topic,
      v_node.universal_skill, v_node.learning_objectives, v_node.archived
    );
  end loop;

  -- Restore help-subtree parents only after every old/new id pair exists.
  if coalesce(array_length(v_old_ids, 1), 0) > 0 then
    for v_index in 1..array_length(v_old_ids, 1) loop
      update public.skill_nodes copied
      set parent_node_id = v_new_ids[array_position(v_old_ids, source.parent_node_id)]
      from public.skill_nodes source
      where source.id = v_old_ids[v_index]
        and copied.id = v_new_ids[v_index]
        and source.parent_node_id = any(v_old_ids);
    end loop;
  end if;

  insert into public.node_prereqs (node_id, prereq_id)
  select
    v_new_ids[array_position(v_old_ids, edge.node_id)],
    v_new_ids[array_position(v_old_ids, edge.prereq_id)]
  from public.node_prereqs edge
  where edge.course_id = p_course_id
    and edge.node_id = any(v_old_ids)
    and edge.prereq_id = any(v_old_ids);

  insert into public.missions (
    id, node_id, title, description, kind, xp_reward,
    estimated_minutes, sort_order
  )
  select
    gen_random_uuid(),
    v_new_ids[array_position(v_old_ids, mission.node_id)],
    mission.title,
    mission.description,
    mission.kind,
    mission.xp_reward,
    mission.estimated_minutes,
    mission.sort_order
  from public.missions mission
  where mission.node_id = any(v_old_ids);

  return v_new_course_id;
end;
$$;

revoke all on function public.fork_course(uuid) from public;
grant execute on function public.fork_course(uuid) to authenticated;
