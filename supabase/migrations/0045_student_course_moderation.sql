-- Student-course moderation and complete course-authoring audit trail.

create or replace function public.effective_account_type(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.is_administrator(p_user_id)
      or public.is_verified_instructor(p_user_id)
      or exists (select 1 from public.courses c where c.owner_id = p_user_id and c.course_kind = 'official')
      or exists (select 1 from auth.users u where u.id = p_user_id and u.raw_app_meta_data ->> 'account_type' = 'instructor')
    then 'instructor' else 'student' end;
$$;

create or replace function public.instructor_course_directory()
returns table (
  id uuid, title text, term text, owner_id uuid, owner_name text,
  owner_type text, course_kind text, publication_status text,
  can_open boolean, can_delete boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_admin boolean := public.is_administrator();
begin
  if v_actor is null or (not v_admin and not public.is_verified_instructor(v_actor)) then
    raise exception 'Only an instructor can read the course directory.' using errcode = '42501';
  end if;

  return query
    select c.id, c.title, c.term, c.owner_id,
      coalesce(nullif(p.display_name, ''), nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Unnamed account')::text,
      public.effective_account_type(c.owner_id), c.course_kind::text,
      c.publication_status::text, (c.owner_id = v_actor or v_admin),
      (c.owner_id = v_actor or public.effective_account_type(c.owner_id) = 'student')
    from public.courses c
    left join public.profiles p on p.id = c.owner_id
    left join auth.users u on u.id = c.owner_id
    where v_admin or c.owner_id = v_actor or public.effective_account_type(c.owner_id) = 'student'
    order by c.created_at desc, c.id;
end;
$$;

drop policy if exists "delete own private courses" on public.courses;
drop policy if exists "delete own courses" on public.courses;

create policy "delete own courses"
  on public.courses
  for delete
  using (owner_id = auth.uid());

comment on policy "delete own courses" on public.courses is
  'An owner may delete their own course through normal course surfaces.';

create or replace function public.instructor_delete_course(p_course_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
begin
  if v_actor is null or (not public.is_administrator() and not public.is_verified_instructor(v_actor)) then
    raise exception 'Only an instructor can delete a course here.' using errcode = '42501';
  end if;
  select c.owner_id into v_owner from public.courses c where c.id = p_course_id for update;
  if v_owner is null then raise exception 'That course no longer exists.'; end if;
  if v_owner <> v_actor and public.effective_account_type(v_owner) <> 'student' then
    raise exception 'Another instructor''s course cannot be deleted here.' using errcode = '42501';
  end if;
  delete from public.courses where id = p_course_id;
end;
$$;

alter table public.admin_audit_log drop constraint if exists admin_audit_log_actor_role_check;
alter table public.admin_audit_log add constraint admin_audit_log_actor_role_check
  check (actor_role in ('owner', 'instructor', 'administrator'));

create or replace function public.audit_course_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_role text;
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'INSERT' then v_owner := new.owner_id; else v_owner := old.owner_id; end if;
  v_role := case when v_owner = auth.uid() then 'owner'
    when public.is_administrator() then 'administrator' else 'instructor' end;

  if tg_op = 'INSERT' then
    perform public.write_admin_audit('course.created', null, new.id,
      jsonb_build_object('kind', new.course_kind), v_role);
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform public.write_admin_audit('course.deleted', null, null,
      jsonb_build_object('title', old.title, 'kind', old.course_kind), v_role);
    return null;
  end if;
  if old.owner_id is distinct from new.owner_id then
    perform public.write_admin_audit('course.owner_changed', new.owner_id, new.id,
      jsonb_build_object('was', old.owner_id, 'was_name', coalesce(
        nullif((select p.display_name from public.profiles p where p.id = old.owner_id), ''),
        (select u.email from auth.users u where u.id = old.owner_id))), v_role);
  end if;
  if old.publication_status is distinct from new.publication_status then
    perform public.write_admin_audit(
      case new.publication_status when 'published' then 'course.published'
        when 'archived' then 'course.archived' else 'course.unpublished' end,
      null, new.id, jsonb_build_object('was', old.publication_status), v_role);
  end if;
  if old.title is distinct from new.title then
    perform public.write_admin_audit('course.renamed', null, new.id,
      jsonb_build_object('was', old.title), v_role);
  end if;
  return null;
end;
$$;

create or replace function public.update_course_mission(
  p_mission_id uuid, p_title text, p_description text, p_xp_reward integer,
  p_estimated_minutes integer, p_difficulty text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_node_id uuid; v_course_id uuid; v_owner uuid; v_was_title text;
  v_was_description text; v_was_xp integer; v_was_minutes integer;
  v_was_difficulty text; v_role text;
begin
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Mission title is required.'; end if;
  if p_xp_reward is null or p_xp_reward < 10 or p_xp_reward > 100 then raise exception 'Mission XP must be between 10 and 100.'; end if;
  if p_estimated_minutes is null or p_estimated_minutes < 1 or p_estimated_minutes > 600 then raise exception 'Estimated time must be between 1 and 600 minutes.'; end if;
  if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard') then raise exception 'Difficulty must be easy, medium, or hard.'; end if;

  select m.node_id, m.course_id, m.title, m.description, m.xp_reward, m.estimated_minutes, m.difficulty
    into v_node_id, v_course_id, v_was_title, v_was_description, v_was_xp, v_was_minutes, v_was_difficulty
  from public.missions m where m.id = p_mission_id;
  if v_node_id is null or not public.owns_course(v_course_id) then
    raise exception 'Only the course owner can edit this mission.' using errcode = '42501';
  end if;
  perform 1 from public.skill_nodes where id = v_node_id for update;
  update public.missions set title = trim(p_title), description = trim(coalesce(p_description, '')),
    xp_reward = p_xp_reward, estimated_minutes = p_estimated_minutes, difficulty = p_difficulty
  where id = p_mission_id;
  update public.skill_nodes set xp_reward = (
    select coalesce(sum(m.xp_reward), 0)::integer from public.missions m where m.node_id = v_node_id
  ) where id = v_node_id;

  if v_was_title is distinct from trim(p_title)
    or v_was_description is distinct from trim(coalesce(p_description, ''))
    or v_was_xp is distinct from p_xp_reward or v_was_minutes is distinct from p_estimated_minutes
    or v_was_difficulty is distinct from p_difficulty then
    select c.owner_id into v_owner from public.courses c where c.id = v_course_id;
    v_role := case when v_owner = auth.uid() then 'owner'
      when public.is_administrator() then 'administrator' else 'instructor' end;
    perform public.write_admin_audit('mission.edited', null, v_course_id,
      jsonb_build_object('mission', trim(p_title), 'was', v_was_title,
        'xp_was', v_was_xp, 'xp', p_xp_reward), v_role);
  end if;
end;
$$;

revoke all on function public.effective_account_type(uuid) from public, anon, authenticated;
revoke all on function public.instructor_course_directory() from public, anon;
revoke all on function public.instructor_delete_course(uuid) from public, anon;
revoke all on function public.update_course_mission(uuid, text, text, integer, integer, text) from public, anon;
grant execute on function public.instructor_course_directory() to authenticated;
grant execute on function public.instructor_delete_course(uuid) to authenticated;
grant execute on function public.update_course_mission(uuid, text, text, integer, integer, text) to authenticated;

comment on function public.instructor_course_directory() is
  'Own instructor courses and student uploads, with server-computed open and delete permissions.';
comment on function public.instructor_delete_course(uuid) is
  'Deletes the caller''s course or a student upload; another instructor''s course is refused.';
comment on table public.admin_audit_log is
  'Append-only record of owner, instructor and administrator actions on courses, charts, missions and enrolments; readable only by administrators.';
