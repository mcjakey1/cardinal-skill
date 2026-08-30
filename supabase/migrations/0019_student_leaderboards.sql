-- Privacy-safe student leaderboards and personal record activity.
--
-- Peer visibility remains explicit opt-in. Neither function grants a table
-- policy: the security-definer boundary returns only the fields the Record tab
-- needs, only for courses the caller shares, and always includes the caller's
-- own row so opting out never hides their record from themselves.

create or replace function handle_new_user_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists auth_user_profile_created on auth.users;
create trigger auth_user_profile_created
  after insert on auth.users
  for each row execute function handle_new_user_profile();

revoke all on function handle_new_user_profile() from public;

insert into profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (id) do nothing;

create or replace function set_leaderboard_visibility(p_visible boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to change leaderboard visibility.' using errcode = '42501';
  end if;

  select coalesce(raw_user_meta_data ->> 'full_name', '') into v_name
  from auth.users where id = auth.uid();

  insert into profiles (id, display_name, social_opt_in)
  values (auth.uid(), coalesce(v_name, ''), p_visible)
  on conflict (id) do update set social_opt_in = excluded.social_opt_in;
  return p_visible;
end;
$$;

revoke all on function set_leaderboard_visibility(boolean) from public;
grant execute on function set_leaderboard_visibility(boolean) to authenticated;

create or replace function own_record_events(p_course_id uuid default null)
returns table (
  course_id uuid,
  node_id uuid,
  completed_at timestamptz,
  event_kind text
)
language sql stable security definer set search_path = public as $$
  with readable_courses as (
    select c.id
    from courses c
    where (p_course_id is null or c.id = p_course_id)
      and (
        c.owner_id = auth.uid()
        or exists (
          select 1 from enrollments e
          where e.course_id = c.id and e.user_id = auth.uid()
        )
      )
  )
  select n.course_id, np.node_id, np.completed_at, 'node'::text
  from node_progress np
  join skill_nodes n on n.id = np.node_id
  join readable_courses rc on rc.id = n.course_id
  where np.user_id = auth.uid()
    and np.status = 'mastered'
    and np.completed_at is not null
  union all
  select m.course_id, m.node_id, mp.completed_at, 'mission'::text
  from mission_progress mp
  join missions m on m.id = mp.mission_id
  join readable_courses rc on rc.id = m.course_id
  where mp.user_id = auth.uid();
$$;

revoke all on function own_record_events(uuid) from public;
grant execute on function own_record_events(uuid) to authenticated;

create or replace function student_leaderboard(p_course_id uuid default null)
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
language sql stable security definer set search_path = public as $$
  with caller_courses as (
    select e.course_id
    from enrollments e
    where e.user_id = auth.uid() and e.role = 'student'
  ),
  scope_courses as (
    select course_id
    from caller_courses
    where p_course_id is null or course_id = p_course_id
  ),
  candidate_courses as (
    select distinct e.user_id, e.course_id
    from enrollments e
    join scope_courses sc on sc.course_id = e.course_id
    left join profiles p on p.id = e.user_id
    where e.role = 'student'
      and (coalesce(p.social_opt_in, false) or e.user_id = auth.uid())
  ),
  candidates as (
    select distinct user_id from candidate_courses
  ),
  scoped_nodes as (
    select n.id, n.course_id, n.xp_reward, n.graded
    from skill_nodes n
    join scope_courses sc on sc.course_id = n.course_id
    where not n.archived
  ),
  graded_nodes as (
    select id, course_id, xp_reward
    from scoped_nodes
    where graded
  ),
  node_totals as (
    select cc.user_id, count(n.id)::integer as total
    from candidate_courses cc
    left join graded_nodes n on n.course_id = cc.course_id
    group by cc.user_id
  ),
  mission_totals as (
    select m.node_id, count(*)::integer as total
    from missions m
    join scoped_nodes n on n.id = m.node_id
    group by m.node_id
  ),
  graded_mission_totals as (
    select mt.node_id, mt.total
    from mission_totals mt
    join graded_nodes n on n.id = mt.node_id
  ),
  mission_work as (
    select mp.user_id, m.node_id,
           count(*)::integer as completed,
           coalesce(sum(m.xp_reward), 0)::integer as xp
    from mission_progress mp
    join missions m on m.id = mp.mission_id
    join scoped_nodes n on n.id = m.node_id
    join candidate_courses cc on cc.user_id = mp.user_id and cc.course_id = n.course_id
    group by mp.user_id, m.node_id
  ),
  direct_work as (
    select np.user_id, n.id as node_id, n.xp_reward
    from node_progress np
    join scoped_nodes n on n.id = np.node_id
    join candidate_courses cc on cc.user_id = np.user_id and cc.course_id = n.course_id
    where np.status = 'mastered'
      and not exists (select 1 from mission_totals mt where mt.node_id = n.id)
  ),
  mastered_nodes as (
    select np.user_id, n.id as node_id
    from node_progress np
    join graded_nodes n on n.id = np.node_id
    join candidate_courses cc on cc.user_id = np.user_id and cc.course_id = n.course_id
    where np.status = 'mastered'
    union
    select mw.user_id, mw.node_id
    from mission_work mw
    join graded_mission_totals mt on mt.node_id = mw.node_id
    where mw.completed = mt.total
  ),
  activity_days as (
    select distinct np.user_id, np.completed_at::date as activity_day
    from node_progress np
    join scoped_nodes n on n.id = np.node_id
    join candidate_courses cc on cc.user_id = np.user_id and cc.course_id = n.course_id
    where np.status = 'mastered' and np.completed_at is not null
    union
    select distinct mp.user_id, mp.completed_at::date
    from mission_progress mp
    join missions m on m.id = mp.mission_id
    join scoped_nodes n on n.id = m.node_id
    join candidate_courses cc on cc.user_id = mp.user_id and cc.course_id = n.course_id
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
    where aa.anchor_day is not null
      and ai.island = aa.anchor_day + 1
    group by ai.user_id
  ),
  stats as (
    select
      c.user_id,
      coalesce(nullif(p.display_name, ''), case when c.user_id = auth.uid() then 'You' else 'Unnamed student' end) as display_name,
      coalesce((select sum(mw.xp)::integer from mission_work mw where mw.user_id = c.user_id), 0)
        + coalesce((select sum(dw.xp_reward)::integer from direct_work dw where dw.user_id = c.user_id), 0) as xp,
      coalesce((select count(*)::integer from mastered_nodes mn where mn.user_id = c.user_id), 0) as mastered,
      nt.total as total_nodes,
      coalesce(s.streak, 0) as streak,
      c.user_id = auth.uid() as is_current_user
    from candidates c
    left join profiles p on p.id = c.user_id
    left join streaks s on s.user_id = c.user_id
    join node_totals nt on nt.user_id = c.user_id
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

revoke all on function student_leaderboard(uuid) from public;
grant execute on function student_leaderboard(uuid) to authenticated;
