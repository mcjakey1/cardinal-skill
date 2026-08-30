-- Instructors read their own students' progress, by name.
--
-- THIS MOVES A BOUNDARY THAT 0001 AND 0003 DELIBERATELY DREW. Both of those
-- files say, in as many words, that `node_progress` and `mission_progress` carry
-- no instructor policy and that the instructor view is aggregates only. That was
-- the product decision then; this is the product decision now, and the reasoning
-- for the change belongs here rather than in a commit message.
--
-- WHAT OPENS
--   The owner of a course can SELECT, for that course only:
--     * who is enrolled on it                       (enrollments)
--     * those students' display names               (profiles)
--     * which of its nodes they have mastered       (node_progress)
--     * which of its missions they have finished    (mission_progress)
--     * the XP they earned on it                    (xp_events)
--
-- WHAT STAYS SHUT
--   * Writes. Every policy below is FOR SELECT. A student's record is still
--     written only by that student — the pre-existing FOR ALL policies keep
--     insert, update and delete at `user_id = auth.uid()`. An instructor who
--     could rewrite progress could rewrite the evidence of their own marking.
--   * Other people's courses. Every check runs through `owns_course`, so this
--     grants nothing outside the courses the caller owns.
--   * Students reading each other. Nothing here touches the student policies.
--   * Grades. Cardinal Skill does not store them (PRODUCT.md), which is why
--     "never a named student's grades" survives this change intact: what an
--     instructor of record can now see is progress through work they set, the
--     same read Canvas and Google Classroom already give them.
--   * `social_opt_in`. That flag governs peer visibility — leaderboards and
--     guilds — and is not consulted here. A student cannot opt out of their own
--     instructor seeing their progress in that instructor's course, exactly as
--     they cannot in any other LMS.
--
-- WHY THE HELPER FUNCTIONS
--   `courses` has a policy that reads `enrollments`. A policy on `enrollments`
--   that read `courses` back would make the two mutually recursive, and Postgres
--   raises "infinite recursion detected in policy for relation". Each check below
--   therefore goes through a `security definer` function, which runs as the table
--   owner and so evaluates its lookup with RLS bypassed. The functions return a
--   boolean about the *caller's own* ownership and leak nothing on their own.

-- ------------------------------------------------------------------- helpers

create or replace function owns_course(p_course_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from courses
    where id = p_course_id and owner_id = auth.uid()
  );
$$;

create or replace function owns_node_course(p_node_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owns_course((select course_id from skill_nodes where id = p_node_id));
$$;

create or replace function owns_mission_course(p_mission_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owns_course((select course_id from missions where id = p_mission_id));
$$;

-- True when this person is enrolled as a student on any course the caller owns.
-- Broader than one course on purpose: it answers "may I see this name at all",
-- which is the question a profile read asks.
create or replace function teaches_student(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from enrollments e
    join courses c on c.id = e.course_id
    where e.user_id = p_user_id
      and e.role = 'student'
      and c.owner_id = auth.uid()
  );
$$;

-- -------------------------------------------------------------------- policies

-- Permissive policies are ORed with the ones already on these tables, so each of
-- these adds a second way to pass SELECT and takes nothing away from the first.

create policy "owner reads course enrollments" on enrollments
  for select using (owns_course(course_id));

create policy "owner reads enrolled student profiles" on profiles
  for select using (teaches_student(profiles.id));

create policy "owner reads student node progress" on node_progress
  for select using (owns_node_course(node_id));

create policy "owner reads student mission progress" on mission_progress
  for select using (owns_mission_course(mission_id));

create policy "owner reads student xp" on xp_events
  for select using (course_id is not null and owns_course(course_id));

-- --------------------------------------------------------------------- roster

-- One row per enrolled student: the read this migration exists to serve.
--
-- Written as a function rather than left to the client because the roster is a
-- five-table join, and a client assembling it would be a client deciding what a
-- roster is. The ownership gate is repeated here even though the policies above
-- already hold: this runs `security definer`, so it is the only thing standing
-- between a caller and someone else's class.
--
-- The denominator counts graded nodes only. Help subtrees are ungraded, exist
-- for one student, and are grafted at that student's request — counting them
-- would make a student's percentage fall for asking for help, which is the exact
-- opposite of what 0004 spent a migration guaranteeing.
--
-- There is no streak column and none is invented. `last_active` is the real
-- thing the screen wanted a streak for: when this student last cleared anything.
create or replace function course_student_progress(p_course_id uuid)
returns table (
  user_id      uuid,
  display_name text,
  mastered     integer,
  graded_nodes integer,
  progress     integer,
  xp           integer,
  last_active  timestamptz
)
language sql stable security definer set search_path = public as $$
  with graded as (
    select count(*)::integer as total
    from skill_nodes
    where course_id = p_course_id and graded
  )
  select
    r.user_id,
    -- A profile row can be missing or blank. Neither is an error worth failing
    -- a roster over, and neither is a student the instructor cannot identify by
    -- their place in the list.
    coalesce(nullif(p.display_name, ''), 'Unnamed student'),
    coalesce(m.mastered, 0),
    graded.total,
    case
      when graded.total = 0 then 0
      else round(coalesce(m.mastered, 0)::numeric * 100 / graded.total)::integer
    end,
    coalesce(x.xp, 0),
    m.last_active
  from (
    select e.user_id
    from enrollments e
    where e.course_id = p_course_id and e.role = 'student'
  ) r
  cross join graded
  left join profiles p on p.id = r.user_id
  left join lateral (
    select count(*)::integer as mastered, max(np.completed_at) as last_active
    from node_progress np
    join skill_nodes n on n.id = np.node_id
    where np.user_id = r.user_id
      and n.course_id = p_course_id
      and n.graded
      and np.status = 'mastered'
  ) m on true
  left join lateral (
    select coalesce(sum(xe.amount), 0)::integer as xp
    from xp_events xe
    where xe.user_id = r.user_id and xe.course_id = p_course_id
  ) x on true
  where owns_course(p_course_id)
  -- Least progress first. The reason to open a roster is to find who is stuck,
  -- and a list that opens on the students who are fine buries them.
  order by 5, 2;
$$;
