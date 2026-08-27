-- Freeze XP at completion time and keep every competitive ladder inside one
-- published course. Content authors can change future rewards without rewriting
-- a learner's history, and private practice never enters a social leaderboard.

alter table public.mission_progress
  add column xp_awarded integer;

alter table public.node_progress
  add column xp_awarded integer;

update public.mission_progress mp
set xp_awarded = m.xp_reward
from public.missions m
where m.id = mp.mission_id;

update public.node_progress np
set xp_awarded = case
  when np.status = 'mastered' and not exists (
    select 1 from public.missions m where m.node_id = np.node_id
  ) then n.xp_reward
  else 0
end
from public.skill_nodes n
where n.id = np.node_id;

alter table public.mission_progress
  alter column xp_awarded set not null,
  add constraint mission_progress_xp_awarded_check
    check (xp_awarded between 0 and 10000);

alter table public.node_progress
  alter column xp_awarded set not null,
  add constraint node_progress_xp_awarded_check
    check (xp_awarded between 0 and 10000);

comment on column public.mission_progress.xp_awarded is
  'Immutable reward snapshot captured when the mission is first completed.';
comment on column public.node_progress.xp_awarded is
  'Immutable reward snapshot for direct completion of a node with no missions.';

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
        (c.course_kind = 'practice' and c.owner_id = p_user_id)
        or (
          c.course_kind in ('official', 'community')
          and c.publication_status in ('published', 'archived')
          and c.owner_id <> p_user_id
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

create or replace function public.node_prerequisites_mastered(
  p_user_id uuid,
  p_node_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.node_prereqs edge
    where edge.node_id = p_node_id
      and not (
        exists (
          select 1
          from public.node_progress np
          where np.user_id = p_user_id
            and np.node_id = edge.prereq_id
            and np.status = 'mastered'
            and not exists (
              select 1 from public.missions direct_mission
              where direct_mission.node_id = edge.prereq_id
            )
        )
        or (
          exists (
            select 1 from public.missions defined
            where defined.node_id = edge.prereq_id
          )
          and not exists (
            select 1
            from public.missions required
            where required.node_id = edge.prereq_id
              and not exists (
                select 1
                from public.mission_progress mp
                where mp.user_id = p_user_id
                  and mp.mission_id = required.id
              )
          )
        )
      )
  );
$$;

create or replace function public.protect_mission_progress_award()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id uuid;
  v_node_id uuid;
  v_reward integer;
  v_existing integer;
begin
  if auth.uid() is null then
    if new.xp_awarded is null then
      select m.xp_reward into new.xp_awarded
      from public.missions m where m.id = new.mission_id;
    end if;
    return new;
  end if;

  if new.user_id <> auth.uid() then
    raise exception 'You can only update your own mission progress.' using errcode = '42501';
  end if;

  select m.course_id, m.node_id, m.xp_reward
  into v_course_id, v_node_id, v_reward
  from public.missions m
  where m.id = new.mission_id;

  if v_course_id is null
    or not public.can_record_course_progress(new.user_id, v_course_id) then
    raise exception 'This course cannot record learner progress for this account.'
      using errcode = '42501';
  end if;

  if not public.node_prerequisites_mastered(new.user_id, v_node_id) then
    raise exception 'Complete the prerequisite nodes before this mission.'
      using errcode = '23514';
  end if;

  select mp.xp_awarded into v_existing
  from public.mission_progress mp
  where mp.user_id = new.user_id and mp.mission_id = new.mission_id;

  new.xp_awarded := coalesce(v_existing, v_reward);
  new.verified_by := 'self';
  return new;
end;
$$;

create or replace function public.protect_node_progress_award()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id uuid;
  v_reward integer;
  v_existing integer;
begin
  if auth.uid() is null then
    if new.xp_awarded is null then
      select case
        when new.status = 'mastered' and not exists (
          select 1 from public.missions m where m.node_id = new.node_id
        ) then n.xp_reward else 0 end
      into new.xp_awarded
      from public.skill_nodes n where n.id = new.node_id;
    end if;
    return new;
  end if;

  if new.user_id <> auth.uid() then
    raise exception 'You can only update your own node progress.' using errcode = '42501';
  end if;

  select n.course_id, n.xp_reward
  into v_course_id, v_reward
  from public.skill_nodes n
  where n.id = new.node_id;

  if v_course_id is null
    or not public.can_record_course_progress(new.user_id, v_course_id) then
    raise exception 'This course cannot record learner progress for this account.'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.missions m where m.node_id = new.node_id) then
    raise exception 'Complete this node through its missions.' using errcode = '23514';
  end if;

  if new.status = 'mastered'
    and not public.node_prerequisites_mastered(new.user_id, new.node_id) then
    raise exception 'Complete the prerequisite nodes before this node.'
      using errcode = '23514';
  end if;

  select np.xp_awarded into v_existing
  from public.node_progress np
  where np.user_id = new.user_id
    and np.node_id = new.node_id
    and np.status = 'mastered';

  new.xp_awarded := case
    when new.status = 'mastered' then coalesce(v_existing, v_reward)
    else 0
  end;
  new.verified_by := 'self';
  return new;
end;
$$;

create trigger protect_mission_progress_award
  before insert or update on public.mission_progress
  for each row execute function public.protect_mission_progress_award();

create trigger protect_node_progress_award
  before insert or update on public.node_progress
  for each row execute function public.protect_node_progress_award();

revoke all on function public.can_record_course_progress(uuid, uuid) from public;
revoke all on function public.node_prerequisites_mastered(uuid, uuid) from public;
revoke all on function public.protect_mission_progress_award() from public;
revoke all on function public.protect_node_progress_award() from public;

create or replace function public.set_mission_completion(
  p_mission_id uuid,
  p_done boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to update mission progress.' using errcode = '42501';
  end if;

  if p_done then
    insert into public.mission_progress (user_id, mission_id, verified_by, xp_awarded)
    values (auth.uid(), p_mission_id, 'self', 0)
    on conflict (user_id, mission_id) do nothing;
  else
    delete from public.mission_progress
    where user_id = auth.uid() and mission_id = p_mission_id;
  end if;
end;
$$;

create or replace function public.set_node_completion(
  p_node_id uuid,
  p_completed_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to update node progress.' using errcode = '42501';
  end if;

  insert into public.node_progress (
    user_id, node_id, status, completed_at, verified_by, xp_awarded
  ) values (
    auth.uid(), p_node_id, 'mastered', coalesce(p_completed_at, now()), 'self', 0
  )
  on conflict (user_id, node_id) do update
    set status = excluded.status,
        completed_at = excluded.completed_at,
        verified_by = excluded.verified_by;
end;
$$;

revoke all on function public.set_mission_completion(uuid, boolean) from public;
revoke all on function public.set_node_completion(uuid, timestamptz) from public;
grant execute on function public.set_mission_completion(uuid, boolean) to authenticated;
grant execute on function public.set_node_completion(uuid, timestamptz) to authenticated;

create or replace function public.total_xp_for_course(p_course_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(mp.xp_awarded)::integer
      from public.mission_progress mp
      join public.missions m on m.id = mp.mission_id
      where mp.user_id = auth.uid() and m.course_id = p_course_id
    ), 0)
    + coalesce((
      select sum(np.xp_awarded)::integer
      from public.node_progress np
      join public.skill_nodes n on n.id = np.node_id
      where np.user_id = auth.uid()
        and n.course_id = p_course_id
        and np.status = 'mastered'
        and not exists (
          select 1 from public.missions m where m.node_id = n.id
        )
    ), 0);
$$;

revoke all on function public.total_xp_for_course(uuid) from public;
grant execute on function public.total_xp_for_course(uuid) to authenticated;

create or replace function public.student_leaderboard(p_course_id uuid default null)
returns table (
  rank_position integer,
  display_name text,
  level integer,
  xp integer,
  mastered integer,
  total_nodes integer,
  streak integer,
  participant_count integer,
  is_current_user boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with scope_course as (
    select c.id, c.owner_id
    from public.courses c
    join public.enrollments mine
      on mine.course_id = c.id
     and mine.user_id = auth.uid()
     and mine.role = 'student'
    where p_course_id is not null
      and c.id = p_course_id
      and c.course_kind in ('official', 'community')
      and c.publication_status in ('published', 'archived')
      and c.owner_id <> auth.uid()
  ),
  candidates as (
    select e.user_id
    from public.enrollments e
    join scope_course sc on sc.id = e.course_id
    left join public.profiles p on p.id = e.user_id
    where e.role = 'student'
      and e.user_id <> sc.owner_id
      and (coalesce(p.social_opt_in, false) or e.user_id = auth.uid())
  ),
  scoped_nodes as (
    select n.id, n.graded
    from public.skill_nodes n
    join scope_course sc on sc.id = n.course_id
    where not n.archived
  ),
  graded_nodes as (
    select id from scoped_nodes where graded
  ),
  node_total as (
    select count(*)::integer as total from graded_nodes
  ),
  mission_totals as (
    select m.node_id, count(*)::integer as total
    from public.missions m
    join scoped_nodes n on n.id = m.node_id
    group by m.node_id
  ),
  mission_work as (
    select mp.user_id, m.node_id,
      count(*)::integer as completed,
      coalesce(sum(mp.xp_awarded), 0)::integer as xp
    from public.mission_progress mp
    join public.missions m on m.id = mp.mission_id
    join scoped_nodes n on n.id = m.node_id
    join candidates c on c.user_id = mp.user_id
    group by mp.user_id, m.node_id
  ),
  direct_work as (
    select np.user_id, n.id as node_id, np.xp_awarded
    from public.node_progress np
    join scoped_nodes n on n.id = np.node_id
    join candidates c on c.user_id = np.user_id
    where np.status = 'mastered'
      and not exists (select 1 from mission_totals mt where mt.node_id = n.id)
  ),
  mastered_nodes as (
    select dw.user_id, dw.node_id
    from direct_work dw
    join graded_nodes n on n.id = dw.node_id
    union
    select mw.user_id, mw.node_id
    from mission_work mw
    join mission_totals mt on mt.node_id = mw.node_id
    join graded_nodes n on n.id = mw.node_id
    where mw.completed = mt.total
  ),
  activity_days as (
    select distinct np.user_id, np.completed_at::date as activity_day
    from public.node_progress np
    join scoped_nodes n on n.id = np.node_id
    join candidates c on c.user_id = np.user_id
    where np.status = 'mastered' and np.completed_at is not null
    union
    select distinct mp.user_id, mp.completed_at::date
    from public.mission_progress mp
    join public.missions m on m.id = mp.mission_id
    join scoped_nodes n on n.id = m.node_id
    join candidates c on c.user_id = mp.user_id
  ),
  activity_anchors as (
    select user_id,
      case
        when bool_or(activity_day = current_date) then current_date
        when bool_or(activity_day = current_date - 1) then current_date - 1
        else null
      end as anchor_day
    from activity_days
    group by user_id
  ),
  activity_islands as (
    select user_id, activity_day,
      activity_day + row_number() over (
        partition by user_id order by activity_day desc
      )::integer as island
    from activity_days
    where activity_day <= current_date
  ),
  streaks as (
    select ai.user_id, count(*)::integer as streak
    from activity_islands ai
    join activity_anchors aa on aa.user_id = ai.user_id
    where aa.anchor_day is not null and ai.island = aa.anchor_day + 1
    group by ai.user_id
  ),
  stats as (
    select
      c.user_id,
      coalesce(
        nullif(p.display_name, ''),
        case when c.user_id = auth.uid() then 'You' else 'Unnamed student' end
      ) as display_name,
      coalesce((select sum(mw.xp)::integer from mission_work mw where mw.user_id = c.user_id), 0)
        + coalesce((select sum(dw.xp_awarded)::integer from direct_work dw where dw.user_id = c.user_id), 0) as xp,
      coalesce((select count(*)::integer from mastered_nodes mn where mn.user_id = c.user_id), 0) as mastered,
      nt.total as total_nodes,
      coalesce(s.streak, 0) as streak,
      c.user_id = auth.uid() as is_current_user
    from candidates c
    cross join node_total nt
    left join public.profiles p on p.id = c.user_id
    left join streaks s on s.user_id = c.user_id
  ),
  ranked as (
    select
      (row_number() over (order by xp desc, mastered desc, display_name, user_id))::integer as rank_position,
      stats.*,
      (count(*) over ())::integer as participant_count
    from stats
  )
  select
    rank_position,
    display_name,
    floor(sqrt(greatest(xp, 0)::numeric / 100))::integer + 1 as level,
    xp,
    mastered,
    total_nodes,
    streak,
    participant_count,
    is_current_user
  from ranked
  where rank_position <= 50 or is_current_user
  order by rank_position;
$$;

revoke all on function public.student_leaderboard(uuid) from public;
grant execute on function public.student_leaderboard(uuid) to authenticated;
