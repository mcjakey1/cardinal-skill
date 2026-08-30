-- Community authors choose whether to join the same isolated ladder as their
-- learners. The explicit social opt-in remains required, and the union covers
-- older published courses whose owner enrollment was changed to instructor.
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
    select c.id, c.owner_id, c.course_kind
    from public.courses c
    where p_course_id is not null
      and c.id = p_course_id
      and c.course_kind in ('official', 'community')
      and c.publication_status in ('published', 'archived')
      and (
        (
          c.owner_id <> auth.uid()
          and exists (
            select 1
            from public.enrollments mine
            where mine.course_id = c.id
              and mine.user_id = auth.uid()
              and mine.role = 'student'
          )
        )
        or (c.course_kind = 'community' and c.owner_id = auth.uid())
      )
  ),
  candidates as (
    select e.user_id
    from public.enrollments e
    join scope_course sc on sc.id = e.course_id
    left join public.profiles p on p.id = e.user_id
    where e.role = 'student'
      and e.user_id <> sc.owner_id
      and (
        coalesce(p.social_opt_in, false)
        or (
          e.user_id = auth.uid()
          and not exists (
            select 1 from public.verified_instructors vi where vi.user_id = e.user_id
          )
        )
      )
    union
    select sc.owner_id
    from scope_course sc
    join public.profiles owner_profile on owner_profile.id = sc.owner_id
    where sc.course_kind = 'community'
      and sc.owner_id = auth.uid()
      and coalesce(owner_profile.social_opt_in, false)
  ),
  course_nodes as (
    select n.id, n.graded, n.archived
    from public.skill_nodes n
    join scope_course sc on sc.id = n.course_id
  ),
  graded_nodes as (
    select id from course_nodes where graded and not archived
  ),
  node_total as (
    select count(*)::integer as total from graded_nodes
  ),
  mission_totals as (
    select m.node_id, count(*)::integer as total
    from public.missions m
    join course_nodes n on n.id = m.node_id
    group by m.node_id
  ),
  mission_work as (
    select mp.user_id, m.node_id,
      count(*)::integer as completed,
      coalesce(sum(mp.xp_awarded), 0)::integer as xp
    from public.mission_progress mp
    join public.missions m on m.id = mp.mission_id
    join course_nodes n on n.id = m.node_id
    join candidates c on c.user_id = mp.user_id
    group by mp.user_id, m.node_id
  ),
  direct_work as (
    select np.user_id, n.id as node_id, np.xp_awarded
    from public.node_progress np
    join course_nodes n on n.id = np.node_id
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
    join course_nodes n on n.id = np.node_id
    join candidates c on c.user_id = np.user_id
    where np.status = 'mastered' and np.completed_at is not null
    union
    select distinct mp.user_id, mp.completed_at::date
    from public.mission_progress mp
    join public.missions m on m.id = mp.mission_id
    join course_nodes n on n.id = m.node_id
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
