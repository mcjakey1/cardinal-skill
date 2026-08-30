-- Missions: the work a node is made of, and each student's record of doing it.
--
-- The security model is unchanged from 0001_init.sql and 0002: deny by default,
-- RLS is the access control, and an instructor never reads a named student's
-- record. Two consequences worth stating before the tables:
--
--   * `missions` is course content. Students read it; only the course owner
--     writes it, exactly as 0002 closed skill_nodes to the owner — a student
--     must not be able to re-price the work they are graded on.
--
--   * `mission_progress` is a student record. It carries a student-only policy
--     and deliberately NO instructor policy, matching node_progress. What an
--     instructor sees comes from the aggregate functions at the bottom of this
--     file, which suppress below five students.

-- --------------------------------------------------------------- definitions

-- `course_id` is denormalised so the client can pull one chart's missions
-- without a join, the same trade node_prereqs makes; the trigger below keeps it
-- honest rather than trusting the writer to set it.
create table missions (
  id                uuid primary key default gen_random_uuid(),
  node_id           uuid not null references skill_nodes on delete cascade,
  course_id         uuid references courses on delete cascade,
  title             text not null,
  description       text not null default '',
  kind              node_kind not null default 'topic',
  xp_reward         integer not null default 0 check (xp_reward between 0 and 10000),
  estimated_minutes integer check (estimated_minutes > 0),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

create index missions_node_idx on missions (node_id, sort_order);
create index missions_course_idx on missions (course_id);

create or replace function sync_mission_course() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select course_id into new.course_id from skill_nodes where id = new.node_id;
  return new;
end;
$$;

create trigger missions_sync_course
  before insert or update on missions
  for each row execute function sync_mission_course();

-- ------------------------------------------------------------- student record

create table mission_progress (
  user_id      uuid not null references auth.users on delete cascade,
  mission_id   uuid not null references missions on delete cascade,
  completed_at timestamptz not null default now(),
  -- Who confirmed it. Self-report today; 'instructor' and 'lms' are anticipated.
  verified_by  text not null default 'self' check (verified_by in ('self', 'instructor', 'lms')),
  primary key (user_id, mission_id)
);

create index mission_progress_user_idx on mission_progress (user_id);

alter table missions enable row level security;
alter table mission_progress enable row level security;

-- Readable by anyone who can already read the node it belongs to. Expressed as
-- an existence check against skill_nodes so this policy inherits that table's
-- own rule instead of restating it and drifting from it later.
create policy "read missions of readable nodes" on missions
  for select using (
    exists (select 1 from skill_nodes n where n.id = missions.node_id)
  );

-- Course content is written by the course owner only.
create policy "owner writes missions" on missions
  for all using (
    exists (
      select 1 from skill_nodes n
      join courses c on c.id = n.course_id
      where n.id = missions.node_id and c.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from skill_nodes n
      join courses c on c.id = n.course_id
      where n.id = missions.node_id and c.owner_id = auth.uid()
    )
  );

-- A student sees and writes only their own rows. There is deliberately no
-- instructor policy here, for the same reason node_progress has none: a named
-- student's record is not the instructor view.
create policy "own mission progress" on mission_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --------------------------------------------------------------- aggregates

-- Instructor dashboard: how many students have finished each mission.
-- Suppressed below 5 so a small cohort cannot be de-anonymised by subtraction,
-- and gated on course ownership so it cannot be called for someone else's class.
create or replace function course_mission_summary(p_course_id uuid)
returns table (mission_id uuid, node_id uuid, completed_count integer)
language sql stable security definer set search_path = public as $$
  select m.id, m.node_id, count(*)::integer
  from mission_progress mp
  join missions m on m.id = mp.mission_id
  where m.course_id = p_course_id
    and exists (
      select 1 from courses c
      where c.id = p_course_id and c.owner_id = auth.uid()
    )
  group by m.id, m.node_id
  having count(*) >= 5;
$$;

-- Instructor dashboard: one row describing the cohort, never a student in it.
-- `students` is itself suppressed below 5: a class of three returns no row at
-- all rather than a row saying there are three of them.
create or replace function course_cohort_summary(p_course_id uuid)
returns table (students integer, missions_completed integer, avg_missions_per_student numeric)
language sql stable security definer set search_path = public as $$
  with cohort as (
    select count(distinct mp.user_id)::integer as students,
           count(*)::integer                   as missions_completed
    from mission_progress mp
    join missions m on m.id = mp.mission_id
    where m.course_id = p_course_id
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
