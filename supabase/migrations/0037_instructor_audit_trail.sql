-- Ordinary instructor work, now in the record.
--
-- 0036 says at its "WHAT IS NOT HERE" that an owner publishing their own course
-- is not somebody acting outside their ownership, and leaves it out. That was
-- right while the log answered one question: what did an administrator do to
-- work that was not theirs. It is wrong for the question that actually arrives.
-- "Who took CHEM 101 out of the catalog" is usually answered by its own author,
-- and until now the record had nothing to say about it. This reverses that one
-- exclusion. Everything else 0036 leaves out, it still leaves out.
--
-- WHY A TRIGGER, AND NOT MORE DEFINER FUNCTIONS
--   0036's four writers each log from inside the function that performs the
--   action. That works because those four actions have no other way in. An
--   instructor's do: creating, retitling and deleting a course are plain
--   PostgREST writes under the policies 0027 added — "create own courses",
--   "update own courses", "delete own private courses". There is no function to
--   put a log line inside.
--
--   Wrapping them in new RPCs would not close it. The table policies stay open
--   behind the RPC, so a modified client keeps writing `courses` directly and is
--   never logged — precisely the failure 0036 names in its own header. Revoking
--   those policies to force the RPC re-opens RLS reasoning that took four
--   migrations to settle, and breaks every other reader and writer of the table.
--
--   A trigger cannot be skipped, and one piece of SQL covers every path: the
--   three plain writes, and `publish_community_course` (0031),
--   `publish_official_course` (0028), `archive_shared_course` (0022) and
--   `admin_set_course_publication` below, all of which end in an
--   `update public.courses`.
--
-- HOW DOUBLE LOGGING IS AVOIDED
--   The trigger fires for the administrator functions too. So
--   `admin_set_course_publication` and `admin_set_enrollment` are recreated at
--   the bottom of this file with 0036's bodies minus their `write_admin_audit`
--   calls: a diff of those two against 0036 should show only removals. The
--   trigger is the single writer for anything that lands on `courses` or
--   `enrollments`, whoever the actor is. Two writers for one event is a thing
--   that drifts.
--
--   `admin_set_instructor_verification` and `admin_set_administrator` are
--   untouched. They write `verified_instructors` and `administrators`, neither
--   of which has any client write path at all, so their in-function logging is
--   already unskippable and a trigger there would be churn with no gain.
--
-- WHAT IS STILL NOT HERE
--   * Per-mission edits made by the course's own owner. `update_course_mission`
--     (0027) fires once per save in the mission editor, and a term of authoring
--     would be thousands of rows saying the XP on Mission 3 moved, burying
--     everything this log exists to surface. `chart.published` (0038) records
--     that the tree moved and by how much. The same edit made by somebody who
--     does not own the course is not authoring, and 0040 records it behind the
--     same actor = subject gate the enrolment trigger below uses.
--   * An owner retitling their own course. Housekeeping. An administrator
--     retitling somebody else's is the surprise that generates a ticket, and
--     that is the one recorded — 0028's "administrators update any course"
--     policy is the path that makes it reachable. Upgrade path: delete one
--     `and` in the course trigger below.
--   * Student self-service. Joining a published course, the author's own
--     enrolment inside `publish_official_course`, and the "remove own
--     enrollment" policy (0009) all have actor = subject. On a 300-student
--     course that is 300 rows on day one, and not one of them is an act of
--     authority.
--   * Direct writes to `skill_nodes` and `node_prereqs`. The owner policies
--     exist (0002, 0013) but no client code uses them — authoring goes through
--     `publish_chart_changes`. So a revision is recorded as one publish, and an
--     out-of-band node write is not recorded at all. That is a stated gap, not
--     an oversight. The upgrade is a statement-level trigger with transition
--     tables, and it is not worth its rows until somebody can point at a write
--     that took that path.
--   * Reads, and retention. 0036 states both positions and both still hold.
--     Nothing is ever deleted from this table: a job that trimmed it would be
--     the same lie the absent UPDATE and DELETE policies exist to prevent.
--     Growth is bounded by staff actions rather than by student activity,
--     because of the noise gate below, so a large institution writes thousands
--     of rows a term and not millions. Revisit at roughly ten million. The
--     answer then is an archival copy followed by a delete of exactly what was
--     copied, performed by the service role and itself recorded as an action —
--     never an in-place trim any administrator can reach.
--
-- THE TABLE KEEPS ITS NAME. `admin_audit_log` is a misnomer from here on. A
-- rename costs a policy, six functions and every future reader's memory, and
-- buys no behaviour. The `comment on table` at the bottom of this file says
-- what it now holds, so the instructor rows do not read as a bug.

-- ------------------------------------------------------ which hat was worn

-- Not which hats the actor holds. `is_administrator()` answers that, and it
-- would file an administrator's work on their own course as an intrusion.
-- Resolved at write time for the same reason `actor_name` is: an account can
-- gain or lose the status later, and the row has to keep reading the way it
-- read on the day.
alter table public.admin_audit_log
  add column actor_role text not null default 'administrator'
    check (actor_role in ('owner', 'administrator'));

-- Five more actions. The three catalog moves 0036 already names cover a
-- publication change whoever makes it, so `describeAuditAction` and the
-- previous-status sentence it builds need no change for the owner's version.
alter table public.admin_audit_log drop constraint admin_audit_log_action_check;

alter table public.admin_audit_log add constraint admin_audit_log_action_check
  check (action in (
    'course.created',
    'course.published',
    'course.unpublished',
    'course.archived',
    'course.renamed',
    'course.deleted',
    'chart.published',
    'instructor.verified',
    'instructor.revoked',
    'enrollment.added',
    'enrollment.removed',
    'enrollment.role_changed',
    'administrator.granted',
    'administrator.revoked'
  ));

-- --------------------------------------------------------- the writer, wider

-- Dropped and recreated rather than replaced. A defaulted fifth parameter added
-- to the existing signature would be an overload, and every four-argument call
-- in 0036 would then be ambiguous. Same move, same reason, as 0031 on
-- `publish_community_course`.
drop function public.write_admin_audit(text, uuid, uuid, jsonb);

create function public.write_admin_audit(
  p_action            text,
  p_subject_user_id   uuid default null,
  p_subject_course_id uuid default null,
  p_detail            jsonb default '{}'::jsonb,
  p_actor_role        text default 'administrator'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  insert into public.admin_audit_log (
    actor_id, actor_name, actor_role, action,
    subject_user_id, subject_name,
    subject_course_id, subject_course,
    detail
  )
  values (
    v_actor,
    coalesce(
      nullif((select p.display_name from public.profiles p where p.id = v_actor), ''),
      (select u.email from auth.users u where u.id = v_actor),
      'An administrator'
    ),
    coalesce(p_actor_role, 'administrator'),
    p_action,
    p_subject_user_id,
    coalesce(
      nullif((select p.display_name from public.profiles p where p.id = p_subject_user_id), ''),
      (select u.email from auth.users u where u.id = p_subject_user_id)
    ),
    p_subject_course_id,
    -- A deleted course has no row left to read a title from, and the foreign
    -- key forbids pointing at one. The trigger writes the title it had into
    -- `detail`, and this is where it comes back out — otherwise the row reads
    -- "Deleted a deleted course", which is the failure this table exists to
    -- prevent.
    coalesce(
      (select c.title from public.courses c where c.id = p_subject_course_id),
      p_detail ->> 'title'
    ),
    coalesce(p_detail, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.write_admin_audit(text, uuid, uuid, jsonb, text)
  from public, anon, authenticated;

-- --------------------------------------------------------- courses, recorded

create or replace function public.audit_course_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_role  text;
begin
  -- Migrations, seeds and service-role maintenance carry no end-user context.
  -- Same guard and same reason as `enforce_course_distribution_authority`
  -- (0028): without it, `db reset` writes rows attributed to an administrator
  -- who was never there.
  if auth.uid() is null then
    return null;
  end if;

  -- NEW is unassigned in a DELETE trigger and OLD in an INSERT, so both are
  -- read behind the branch rather than coalesced together.
  if tg_op = 'DELETE' then
    v_owner := old.owner_id;
  else
    v_owner := new.owner_id;
  end if;
  v_role := case when v_owner = auth.uid() then 'owner' else 'administrator' end;

  if tg_op = 'INSERT' then
    perform public.write_admin_audit(
      'course.created', null, new.id,
      jsonb_build_object('kind', new.course_kind), v_role);
    return null;
  end if;

  if tg_op = 'DELETE' then
    -- No `subject_course_id`: the row it would point at is already gone and the
    -- foreign key refuses it. The title rides in `detail` instead.
    perform public.write_admin_audit(
      'course.deleted', null, null,
      jsonb_build_object('title', old.title, 'kind', old.course_kind), v_role);
    return null;
  end if;

  -- Both of the following can be true of one statement. Two changes, two rows;
  -- a single row would have to pick one of them to describe.
  if old.publication_status is distinct from new.publication_status then
    perform public.write_admin_audit(
      case new.publication_status
        when 'published' then 'course.published'
        when 'archived'  then 'course.archived'
        else 'course.unpublished'
      end,
      null, new.id,
      jsonb_build_object('was', old.publication_status),
      v_role);
  end if;

  -- An owner retitling their own course is housekeeping. An administrator
  -- retitling somebody else's is the surprise a reader is here to find, and
  -- 0028's "administrators update any course" policy is the plain UPDATE path
  -- that lets them. Upgrade path, if owner renames turn out to be wanted: drop
  -- the second half of this condition.
  if old.title is distinct from new.title and v_role = 'administrator' then
    perform public.write_admin_audit(
      'course.renamed', null, new.id,
      jsonb_build_object('was', old.title), v_role);
  end if;

  return null;
end;
$$;

drop trigger if exists audit_course_change on public.courses;
create trigger audit_course_change
  after insert or update or delete on public.courses
  for each row execute function public.audit_course_change();

-- ----------------------------------------------------- enrolments, recorded

create or replace function public.audit_enrollment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid;
  v_course uuid;
  v_role   text;
begin
  if auth.uid() is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_user   := old.user_id;
    v_course := old.course_id;
  else
    v_user   := new.user_id;
    v_course := new.course_id;
  end if;

  -- The noise gate, and the whole reason this table stays small. Joining a
  -- published course, leaving one, and the author's own enrolment inside
  -- `publish_official_course` all have actor = subject. None of them is an act
  -- of authority over somebody else, and on a 300-student course they are 300
  -- rows on day one.
  if auth.uid() = v_user then
    return null;
  end if;

  -- Both parents cascade (0001), and a row trigger cannot tell a cascade from
  -- an intention — the same thing 0027 says about deleting a shared course.
  -- Without this, deleting one course records a removal per student on it, and
  -- erasing one account records a removal per course they were ever on.
  if tg_op = 'DELETE'
     and (not exists (select 1 from public.courses where id = v_course)
          or not exists (select 1 from auth.users where id = v_user)) then
    return null;
  end if;

  select case when c.owner_id = auth.uid() then 'owner' else 'administrator' end
    into v_role
    from public.courses c
   where c.id = v_course;
  v_role := coalesce(v_role, 'administrator');

  if tg_op = 'INSERT' then
    perform public.write_admin_audit(
      'enrollment.added', v_user, v_course,
      jsonb_build_object('role', new.role), v_role);
  elsif tg_op = 'DELETE' then
    perform public.write_admin_audit(
      'enrollment.removed', v_user, v_course, '{}'::jsonb, v_role);
  elsif old.role is distinct from new.role then
    -- `is distinct from` is load-bearing. 0022's join and 0036's enrolment both
    -- upsert with `do update set role = excluded.role`, which fires an UPDATE
    -- whether or not anything moved; without the guard every re-join writes a
    -- role change that never happened.
    perform public.write_admin_audit(
      'enrollment.role_changed', v_user, v_course,
      jsonb_build_object('from', old.role, 'to', new.role), v_role);
  end if;

  return null;
end;
$$;

drop trigger if exists audit_enrollment_change on public.enrollments;
create trigger audit_enrollment_change
  after insert or update or delete on public.enrollments
  for each row execute function public.audit_enrollment_change();

-- ------------------------------------------------- the two writers, de-duped

-- 0036's bodies with their audit calls and the status capture those calls
-- needed taken out. The authority checks, the state combinations and the error
-- messages are untouched; a diff against 0036 should show only removals. The
-- triggers above write these rows now.
create or replace function public.admin_set_course_publication(
  p_course_id uuid,
  p_status    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  if not public.is_administrator() then
    raise exception 'Only an administrator can change another account''s course.'
      using errcode = '42501';
  end if;

  select course_kind into v_kind
  from public.courses where id = p_course_id;
  if v_kind is null then
    raise exception 'That course does not exist.';
  end if;
  if v_kind = 'practice' then
    raise exception 'A practice course is private to its owner and has nothing to publish.';
  end if;

  if p_status = 'published' then
    update public.courses
    set publication_status = 'published',
        discoverability = case when course_kind = 'official' then 'public' else discoverability end,
        published_at = coalesce(published_at, now())
    where id = p_course_id;
  elsif p_status = 'draft' then
    update public.courses
    set publication_status = 'draft',
        discoverability = 'private',
        published_at = null,
        share_code = null
    where id = p_course_id;
  elsif p_status = 'archived' then
    update public.courses
    set publication_status = 'archived',
        discoverability = 'private'
    where id = p_course_id;
  else
    raise exception 'A course publication status is published, draft or archived.';
  end if;
end;
$$;

create or replace function public.admin_set_enrollment(
  p_course_id uuid,
  p_user_id   uuid,
  p_enrolled  boolean,
  p_role      text default 'student'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_administrator() then
    raise exception 'Only an administrator can change who is enrolled on a course.'
      using errcode = '42501';
  end if;
  if p_role not in ('student', 'instructor') then
    raise exception 'An enrollment role is student or instructor.';
  end if;
  if not exists (select 1 from public.courses where id = p_course_id) then
    raise exception 'That course does not exist.';
  end if;

  if p_enrolled then
    insert into public.enrollments (user_id, course_id, role)
    values (p_user_id, p_course_id, p_role)
    on conflict (user_id, course_id) do update set role = excluded.role;
  else
    -- Progress rows are keyed on the student, not the enrollment, so removing
    -- someone takes their access and leaves their record intact. Re-enrolling
    -- restores what they had.
    delete from public.enrollments
    where course_id = p_course_id and user_id = p_user_id;
  end if;
end;
$$;

comment on table public.admin_audit_log is
  'Append-only record of administrator and instructor actions on courses and enrolments. Written only by triggers and the definer functions that perform them; readable by administrators.';
