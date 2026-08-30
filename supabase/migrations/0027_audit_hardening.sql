-- Close distribution, privacy, and progress gaps found after community sharing.
-- Instructor verification remains server-managed: only the service role may
-- call the provisioning function below.

create or replace function public.set_instructor_verification(
  p_user_id uuid,
  p_verified boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_verified is null then
    raise exception 'An instructor account and verification state are required.';
  end if;

  if p_verified then
    insert into public.verified_instructors (user_id, verified_by)
    values (p_user_id, auth.uid())
    on conflict (user_id) do update
      set verified_at = now(), verified_by = auth.uid();
  else
    delete from public.verified_instructors where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.set_instructor_verification(uuid, boolean) from public;
revoke all on function public.set_instructor_verification(uuid, boolean) from authenticated;
grant execute on function public.set_instructor_verification(uuid, boolean) to service_role;

comment on function public.set_instructor_verification(uuid, boolean) is
  'Service-role provisioning boundary for official-course instructors.';

-- A row trigger cannot distinguish an owner delete from a foreign-key cascade
-- caused by account erasure. RLS blocks ordinary deletion of shared courses;
-- database cascades can then remove them when the owning account is erased.
drop trigger if exists prevent_shared_course_delete on public.courses;
drop function if exists public.prevent_shared_course_delete();
drop policy if exists "own courses" on public.courses;

create policy "create own courses"
  on public.courses for insert
  with check (owner_id = auth.uid());

create policy "update own courses"
  on public.courses for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "delete own private courses"
  on public.courses for delete
  using (
    owner_id = auth.uid()
    and course_kind = 'practice'
    and publication_status = 'draft'
  );

-- Link-only sharing was removed in 0025. Enforce that state in the schema so
-- a modified owner client cannot restore a hidden-but-joinable course.
update public.courses
set discoverability = 'public'
where discoverability = 'unlisted';

alter table public.courses
  drop constraint courses_distribution_state_check,
  drop constraint courses_discoverability_check;

alter table public.courses
  add constraint courses_discoverability_check
    check (discoverability in ('private', 'public')),
  add constraint courses_distribution_state_check check (
    (
      course_kind = 'practice'
      and publication_status = 'draft'
      and discoverability = 'private'
      and published_at is null
    )
    or (
      course_kind in ('official', 'community')
      and publication_status = 'draft'
      and discoverability = 'private'
      and published_at is null
    )
    or (
      course_kind in ('official', 'community')
      and publication_status = 'published'
      and discoverability = 'public'
      and published_at is not null
    )
    or (
      course_kind in ('official', 'community')
      and publication_status = 'archived'
      and discoverability = 'private'
    )
  );

-- Progress and competitive visibility are separate concerns. Community
-- authors may work through their own material but remain excluded from the
-- learner leaderboard. Existing enrolled learners may continue an official
-- draft while its instructor verification is provisioned.
create or replace function public.can_record_course_progress(
  p_user_id uuid,
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = p_course_id
      and (
        (c.owner_id = p_user_id and c.course_kind in ('practice', 'community'))
        or (
          c.owner_id <> p_user_id
          and c.course_kind in ('official', 'community')
          and (
            c.publication_status in ('published', 'archived')
            or (c.course_kind = 'official' and c.publication_status = 'draft')
          )
          and exists (
            select 1
            from public.enrollments e
            where e.course_id = c.id
              and e.user_id = p_user_id
              and e.role = 'student'
          )
        )
      )
  );
$$;

revoke all on function public.can_record_course_progress(uuid, uuid) from public;

-- Catalog attribution respects the same peer-visibility opt-in as social
-- records. Official instructor attribution remains part of official content.
create or replace function public.resolve_shared_course(p_share_code text)
returns table (
  course_id uuid,
  course_code text,
  title text,
  term text,
  description text,
  units smallint,
  course_kind text,
  owner_display_name text,
  learner_count integer,
  is_joined boolean,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.course_code,
    c.title,
    c.term,
    c.description,
    c.units,
    c.course_kind,
    case
      when coalesce(p.social_opt_in, false)
        then coalesce(nullif(p.display_name, ''), 'Student author')
      else 'Student author'
    end,
    (
      select count(*)::integer from public.enrollments learners
      where learners.course_id = c.id
        and learners.role = 'student'
        and learners.user_id <> c.owner_id
    ),
    c.owner_id = auth.uid() or exists (
      select 1 from public.enrollments mine
      where mine.course_id = c.id and mine.user_id = auth.uid()
    ),
    c.published_at
  from public.courses c
  left join public.profiles p on p.id = c.owner_id
  where auth.uid() is not null
    and c.course_kind = 'community'
    and c.publication_status = 'published'
    and c.discoverability = 'public'
    and c.share_code = lower(trim(p_share_code));
$$;

create or replace function public.course_catalog(p_course_kind text)
returns table (
  course_id uuid,
  course_code text,
  title text,
  term text,
  description text,
  units smallint,
  course_kind text,
  owner_display_name text,
  learner_count integer,
  is_joined boolean,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to browse courses.' using errcode = '42501';
  end if;
  if p_course_kind not in ('official', 'community') then
    raise exception 'Catalog kind must be official or community.';
  end if;

  return query
  select
    c.id,
    c.course_code,
    c.title,
    c.term,
    c.description,
    c.units,
    c.course_kind,
    case
      when c.course_kind = 'official' then
        coalesce(nullif(p.display_name, ''), 'Verified instructor')
      when coalesce(p.social_opt_in, false) then
        coalesce(nullif(p.display_name, ''), 'Student author')
      else 'Student author'
    end,
    (
      select count(*)::integer
      from public.enrollments learners
      where learners.course_id = c.id
        and learners.role = 'student'
        and learners.user_id <> c.owner_id
    ),
    c.owner_id = auth.uid() or exists (
      select 1 from public.enrollments mine
      where mine.course_id = c.id and mine.user_id = auth.uid()
    ),
    c.published_at
  from public.courses c
  left join public.profiles p on p.id = c.owner_id
  where c.course_kind = p_course_kind
    and c.publication_status = 'published'
    and c.discoverability = 'public'
  order by c.published_at desc, c.title, c.id;
end;
$$;

revoke all on function public.course_catalog(text) from public;
revoke all on function public.resolve_shared_course(text) from public;
grant execute on function public.course_catalog(text) to authenticated;
grant execute on function public.resolve_shared_course(text) to authenticated;

-- Instructor roster XP now reads the immutable authoritative snapshots used by
-- the learner leaderboard and personal Record screen.
create or replace function public.course_student_progress(p_course_id uuid)
returns table (
  user_id uuid,
  display_name text,
  mastered integer,
  graded_nodes integer,
  progress integer,
  xp integer,
  last_active timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with graded as (
    select count(*)::integer as total
    from public.skill_nodes
    where course_id = p_course_id and graded and not archived
  )
  select
    roster.user_id,
    coalesce(nullif(p.display_name, ''), 'Unnamed student'),
    coalesce(mastered.mastered, 0),
    graded.total,
    case
      when graded.total = 0 then 0
      else round(coalesce(mastered.mastered, 0)::numeric * 100 / graded.total)::integer
    end,
    coalesce(reward.mission_xp, 0) + coalesce(reward.node_xp, 0),
    mastered.last_active
  from (
    select e.user_id
    from public.enrollments e
    where e.course_id = p_course_id and e.role = 'student'
  ) roster
  cross join graded
  left join public.profiles p on p.id = roster.user_id
  left join lateral (
    select
      count(*) filter (where
        (
          not exists (select 1 from public.missions defined where defined.node_id = n.id)
          and exists (
            select 1 from public.node_progress np
            where np.user_id = roster.user_id
              and np.node_id = n.id
              and np.status = 'mastered'
          )
        )
        or (
          exists (select 1 from public.missions defined where defined.node_id = n.id)
          and not exists (
            select 1 from public.missions required
            where required.node_id = n.id
              and not exists (
                select 1 from public.mission_progress mp
                where mp.user_id = roster.user_id
                  and mp.mission_id = required.id
              )
          )
        )
      )::integer as mastered,
      greatest(
        (
          select max(np.completed_at)
          from public.node_progress np
          join public.skill_nodes activity_node on activity_node.id = np.node_id
          where np.user_id = roster.user_id
            and activity_node.course_id = p_course_id
        ),
        (
          select max(mp.completed_at)
          from public.mission_progress mp
          join public.missions activity_mission on activity_mission.id = mp.mission_id
          where mp.user_id = roster.user_id
            and activity_mission.course_id = p_course_id
        )
      ) as last_active
    from public.skill_nodes n
    where n.course_id = p_course_id
      and n.graded
      and not n.archived
  ) mastered on true
  left join lateral (
    select
      (
        select coalesce(sum(mp.xp_awarded), 0)::integer
        from public.mission_progress mp
        join public.missions m on m.id = mp.mission_id
        where mp.user_id = roster.user_id and m.course_id = p_course_id
      ) as mission_xp,
      (
        select coalesce(sum(np.xp_awarded), 0)::integer
        from public.node_progress np
        join public.skill_nodes n on n.id = np.node_id
        where np.user_id = roster.user_id
          and n.course_id = p_course_id
          and np.status = 'mastered'
          and not exists (select 1 from public.missions m where m.node_id = n.id)
      ) as node_xp
  ) reward on true
  where public.owns_course(p_course_id)
  order by 5, 2;
$$;

revoke all on function public.course_student_progress(uuid) from public;
grant execute on function public.course_student_progress(uuid) to authenticated;

create or replace function public.update_course_mission(
  p_mission_id uuid,
  p_title text,
  p_description text,
  p_xp_reward integer,
  p_estimated_minutes integer,
  p_difficulty text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node_id uuid;
  v_course_id uuid;
begin
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Mission title is required.';
  end if;
  if p_xp_reward is null or p_xp_reward < 10 or p_xp_reward > 100 then
    raise exception 'Mission XP must be between 10 and 100.';
  end if;
  if p_estimated_minutes is null or p_estimated_minutes < 1 or p_estimated_minutes > 600 then
    raise exception 'Estimated time must be between 1 and 600 minutes.';
  end if;
  if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'Difficulty must be easy, medium, or hard.';
  end if;

  select m.node_id, m.course_id into v_node_id, v_course_id
  from public.missions m where m.id = p_mission_id;

  if v_node_id is null or not public.owns_course(v_course_id) then
    raise exception 'Only the course owner can edit this mission.' using errcode = '42501';
  end if;

  perform 1 from public.skill_nodes where id = v_node_id for update;

  update public.missions set
    title = trim(p_title),
    description = trim(coalesce(p_description, '')),
    xp_reward = p_xp_reward,
    estimated_minutes = p_estimated_minutes,
    difficulty = p_difficulty
  where id = p_mission_id;

  update public.skill_nodes set xp_reward = (
    select coalesce(sum(m.xp_reward), 0)::integer
    from public.missions m where m.node_id = v_node_id
  ) where id = v_node_id;
end;
$$;

revoke all on function public.update_course_mission(uuid, text, text, integer, integer, text) from public;
grant execute on function public.update_course_mission(uuid, text, text, integer, integer, text) to authenticated;

create index if not exists enrollments_course_id_idx
  on public.enrollments (course_id, role, user_id);
