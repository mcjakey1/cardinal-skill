-- SkillQuest initial schema.
--
-- Security model: every table has RLS enabled and denies by default. A student
-- can only ever read their own progress rows. Instructors read aggregates for
-- courses they own, never another student's individual grades. This is the
-- FERPA boundary — it lives here, in the database, not in the app.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- identities

create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  -- Opt-in, and off by default. Leaderboards and guild visibility read this.
  social_opt_in boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "read own profile" on profiles
  for select using (auth.uid() = id);
create policy "update own profile" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ------------------------------------------------------------------ courses

create table courses (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users on delete cascade,
  title       text not null,
  term        text,
  -- Storage path of the uploaded syllabus. The file itself lives in a private
  -- bucket; nothing here is publicly readable.
  syllabus_path text,
  created_at  timestamptz not null default now()
);

create table enrollments (
  user_id   uuid not null references auth.users on delete cascade,
  course_id uuid not null references courses on delete cascade,
  role      text not null default 'student' check (role in ('student', 'instructor')),
  primary key (user_id, course_id)
);

alter table courses enable row level security;
alter table enrollments enable row level security;

create policy "read enrolled courses" on courses
  for select using (
    owner_id = auth.uid()
    or exists (select 1 from enrollments e where e.course_id = courses.id and e.user_id = auth.uid())
  );
create policy "own courses" on courses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "read own enrollment" on enrollments
  for select using (user_id = auth.uid());

-- --------------------------------------------------------- universal tracks

-- Cross-course competencies (academic writing, data analysis) that a student
-- develops across semesters. Readable by everyone; authored by staff.
create table tracks (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  description text not null default ''
);

alter table tracks enable row level security;
create policy "tracks are public" on tracks for select using (true);

-- ------------------------------------------------------------- skill nodes

create type node_kind as enum ('topic', 'reading', 'assignment', 'assessment', 'project');

create table skill_nodes (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid references courses on delete cascade,
  track_id    uuid references tracks on delete cascade,
  title       text not null,
  description text not null default '',
  kind        node_kind not null default 'topic',
  xp_reward   integer not null default 50 check (xp_reward between 0 and 10000),
  x           double precision not null default 0,
  y           double precision not null default 0,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  -- A node belongs to exactly one of a course or a universal track.
  constraint node_has_one_parent check (num_nonnulls(course_id, track_id) = 1)
);

create index skill_nodes_course_idx on skill_nodes (course_id, sort_order);

-- Prerequisite edges. `course_id` is denormalised so the client can filter one
-- chart's edges without a join; the trigger below keeps it honest.
create table node_prereqs (
  node_id   uuid not null references skill_nodes on delete cascade,
  prereq_id uuid not null references skill_nodes on delete cascade,
  course_id uuid references courses on delete cascade,
  primary key (node_id, prereq_id),
  constraint no_self_prereq check (node_id <> prereq_id)
);

create index node_prereqs_course_idx on node_prereqs (course_id);

create or replace function sync_prereq_course() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select course_id into new.course_id from skill_nodes where id = new.node_id;
  return new;
end;
$$;

create trigger node_prereqs_sync_course
  before insert or update on node_prereqs
  for each row execute function sync_prereq_course();

alter table skill_nodes enable row level security;
alter table node_prereqs enable row level security;

create policy "read nodes of enrolled courses" on skill_nodes
  for select using (
    track_id is not null
    or exists (
      select 1 from courses c
      where c.id = skill_nodes.course_id
        and (c.owner_id = auth.uid()
             or exists (select 1 from enrollments e
                        where e.course_id = c.id and e.user_id = auth.uid()))
    )
  );

create policy "read prereqs of readable nodes" on node_prereqs
  for select using (
    exists (select 1 from skill_nodes n where n.id = node_prereqs.node_id)
  );

-- ------------------------------------------------------------------ progress

create type progress_status as enum ('available', 'in_progress', 'mastered');

create table node_progress (
  user_id      uuid not null references auth.users on delete cascade,
  node_id      uuid not null references skill_nodes on delete cascade,
  status       progress_status not null default 'in_progress',
  completed_at timestamptz,
  -- Who confirmed it. Manual self-report in the MVP; 'lms' once sync lands.
  verified_by  text not null default 'self' check (verified_by in ('self', 'instructor', 'lms')),
  primary key (user_id, node_id)
);

create table xp_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  node_id    uuid references skill_nodes on delete set null,
  course_id  uuid references courses on delete cascade,
  amount     integer not null check (amount >= 0),
  reason     text not null default 'node_mastered',
  created_at timestamptz not null default now()
);

create index xp_events_user_course_idx on xp_events (user_id, course_id);

alter table node_progress enable row level security;
alter table xp_events enable row level security;

-- A student sees and writes only their own rows. There is deliberately no
-- instructor policy here: per-student grades are not the instructor view.
create policy "own progress" on node_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read own xp" on xp_events
  for select using (user_id = auth.uid());

-- --------------------------------------------------------------- aggregates

-- Total XP the caller has earned on one course.
create or replace function total_xp_for_course(p_course_id uuid)
returns integer
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(amount), 0)::integer
  from xp_events
  where user_id = auth.uid() and course_id = p_course_id;
$$;

-- Instructor dashboard: class-level counts only, never a named student.
-- Suppressed below 5 students so a cohort of two can't be de-anonymised.
create or replace function course_progress_summary(p_course_id uuid)
returns table (node_id uuid, mastered_count integer)
language sql stable security definer set search_path = public as $$
  select p.node_id, count(*)::integer
  from node_progress p
  join skill_nodes n on n.id = p.node_id
  where n.course_id = p_course_id
    and p.status = 'mastered'
    and exists (
      select 1 from courses c
      where c.id = p_course_id and c.owner_id = auth.uid()
    )
  group by p.node_id
  having count(*) >= 5;
$$;
