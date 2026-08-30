-- What an administrator did, and which administrator did it.
--
-- 0028 gave one account the power to act outside its own ownership: publish and
-- archive anyone's course, grant and revoke a verified badge, put a student on
-- a course or take them off, and make another administrator. It gave nobody a
-- way to find out afterwards that any of it happened. This is that record.
--
-- WHERE THE WRITE LIVES, AND WHY IT IS NOT NEGOTIABLE
--   Every insert below happens inside the security-definer function that
--   performs the action, in the same statement sequence, after its
--   `is_administrator()` check has already passed. It is not a second call the
--   client makes.
--
--   A client that logs its own actions is one modified client away from logging
--   none of them, and the whole value of an audit trail is that the party being
--   audited cannot choose to be absent from it. So `admin_audit_log` grants no
--   INSERT to `authenticated` at all — see the grants at the bottom. The only
--   writers are these four functions.
--
-- APPEND ONLY
--   There is no UPDATE policy and no DELETE policy on this table, for anyone,
--   administrators included. A record an administrator can quietly edit is not
--   a record of what an administrator did. Correcting a mistake means a new
--   action with its own row, which is also the honest history.
--
-- WHY THE FOREIGN KEYS DO NOT CASCADE
--   `on delete set null`, deliberately, where the rest of this schema cascades.
--   An account erasure must not erase the trail of what that account did while
--   it held administrator rights — cascading would mean deleting your own
--   account is how you delete your own audit history, which is precisely the
--   move this table exists to catch. The row survives; the link drops, and the
--   name column below is what still reads.
--
--   The same `set null` covers the subject. If a student exercises erasure, the
--   fact that *an* enrolment was changed survives without continuing to point
--   at them.
--
-- WHAT IS NOT HERE
--   * Ordinary instructor work. An owner publishing their own course is not
--     someone acting outside their ownership, and logging every author's every
--     move would bury the four actions this exists to surface.
--   * Reads. This records changes, not who looked at what. A read log over
--     student data is a much larger promise and needs its own design.
--   * Retention or rotation. The table grows; four administrator actions are
--     rare events. Add a policy when there is a volume problem to point at.

create table public.admin_audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),

  -- Who did it. Null once the account is erased; `actor_name` still reads.
  actor_id   uuid references auth.users(id) on delete set null,
  -- Denormalised on purpose. A name resolved at write time survives the
  -- account, and an audit row that reads "someone did this" is not an audit row.
  actor_name text not null,

  -- What they did. `subject.verb`, past tense, from the fixed set below.
  action     text not null check (action in (
    'course.published',
    'course.unpublished',
    'course.archived',
    'instructor.verified',
    'instructor.revoked',
    'enrollment.added',
    'enrollment.removed',
    'administrator.granted',
    'administrator.revoked'
  )),

  -- Whichever of the two the action was aimed at. Both may be set: enrolling
  -- somebody names a person and a course.
  subject_user_id   uuid references auth.users(id) on delete set null,
  subject_name      text,
  subject_course_id uuid references public.courses(id) on delete set null,
  subject_course    text,

  -- Room for the one extra fact an action needs. Course publication puts the
  -- previous status here, because "who took this out of the catalog" is only
  -- half the question and "what was it before" is the other half.
  detail     jsonb not null default '{}'::jsonb
);

create index admin_audit_log_at_idx on public.admin_audit_log (at desc);

alter table public.admin_audit_log enable row level security;

-- Read, to an administrator, over every row — including their own and each
-- other's. "Who did it" is the point, so an administrator seeing only their own
-- actions would defeat it.
create policy "administrators read the audit log"
  on public.admin_audit_log
  for select
  using (public.is_administrator());

-- ------------------------------------------------------------- the writer

-- One place the four functions below call, so the row shape cannot drift
-- between them. `security definer` and revoked from every client role: this is
-- reachable only from inside the functions that already checked authority.
create or replace function public.write_admin_audit(
  p_action            text,
  p_subject_user_id   uuid default null,
  p_subject_course_id uuid default null,
  p_detail            jsonb default '{}'::jsonb
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
    actor_id, actor_name, action,
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
    p_action,
    p_subject_user_id,
    coalesce(
      nullif((select p.display_name from public.profiles p where p.id = p_subject_user_id), ''),
      (select u.email from auth.users u where u.id = p_subject_user_id)
    ),
    p_subject_course_id,
    (select c.title from public.courses c where c.id = p_subject_course_id),
    coalesce(p_detail, '{}'::jsonb)
  );
end;
$$;

-- ------------------------------------------------- the actions, now recorded

-- Unchanged from 0028 except that each branch records what it did. The
-- authority check, the state combinations and the error messages are the same;
-- a diff against 0028 should show only the audit calls and the status capture
-- they need.
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
  v_kind   text;
  v_before text;
begin
  if not public.is_administrator() then
    raise exception 'Only an administrator can change another account''s course.'
      using errcode = '42501';
  end if;

  select course_kind, publication_status into v_kind, v_before
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
    perform public.write_admin_audit(
      'course.published', null, p_course_id, jsonb_build_object('was', v_before));
  elsif p_status = 'draft' then
    update public.courses
    set publication_status = 'draft',
        discoverability = 'private',
        published_at = null,
        share_code = null
    where id = p_course_id;
    perform public.write_admin_audit(
      'course.unpublished', null, p_course_id, jsonb_build_object('was', v_before));
  elsif p_status = 'archived' then
    update public.courses
    set publication_status = 'archived',
        discoverability = 'private'
    where id = p_course_id;
    perform public.write_admin_audit(
      'course.archived', null, p_course_id, jsonb_build_object('was', v_before));
  else
    raise exception 'A course publication status is published, draft or archived.';
  end if;
end;
$$;

create or replace function public.admin_set_instructor_verification(
  p_user_id  uuid,
  p_verified boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_administrator() then
    raise exception 'Only an administrator can change instructor verification.'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Name the account whose verification you are changing.';
  end if;

  if p_verified then
    insert into public.verified_instructors (user_id, verified_by)
    values (p_user_id, auth.uid())
    on conflict (user_id) do update
      set revoked_at = null,
          revoked_by = null,
          verified_at = now(),
          verified_by = auth.uid();
    perform public.write_admin_audit('instructor.verified', p_user_id);
  else
    -- The row stays, carrying the revocation. Deleting it would let the sign-up
    -- trigger grant verification again on the next account creation.
    insert into public.verified_instructors (user_id, verified_by, revoked_at, revoked_by)
    values (p_user_id, auth.uid(), now(), auth.uid())
    on conflict (user_id) do update
      set revoked_at = now(),
          revoked_by = auth.uid();
    perform public.write_admin_audit('instructor.revoked', p_user_id);
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
    perform public.write_admin_audit(
      'enrollment.added', p_user_id, p_course_id, jsonb_build_object('role', p_role));
  else
    -- Progress rows are keyed on the student, not the enrollment, so removing
    -- someone takes their access and leaves their record intact. Re-enrolling
    -- restores what they had.
    delete from public.enrollments
    where course_id = p_course_id and user_id = p_user_id;
    perform public.write_admin_audit('enrollment.removed', p_user_id, p_course_id);
  end if;
end;
$$;

create or replace function public.admin_set_administrator(
  p_user_id uuid,
  p_admin   boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_administrator() then
    raise exception 'Only an administrator can change administrator status.'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Name the account whose administrator status you are changing.';
  end if;

  if p_admin then
    insert into public.administrators (user_id, granted_by)
    values (p_user_id, auth.uid())
    on conflict (user_id) do nothing;
    perform public.write_admin_audit('administrator.granted', p_user_id);
  else
    if p_user_id = auth.uid() then
      -- Removing your own last access is not a moderation action, it is a
      -- lockout. Another administrator can do it.
      raise exception 'Ask another administrator to remove your own administrator status.'
        using errcode = '42501';
    end if;
    delete from public.administrators where user_id = p_user_id;
    perform public.write_admin_audit('administrator.revoked', p_user_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------- the read

-- The joined form the screen draws. A definer function rather than a view so
-- the administrator check is stated in its own body, the way `course_roster`
-- states its own, and so one call answers instead of a select plus two lookups
-- per row.
create or replace function public.admin_audit_trail(p_limit integer default 100)
returns table (
  id           bigint,
  at           timestamptz,
  actor_name   text,
  action       text,
  subject_name text,
  course_title text,
  detail       jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_administrator() then
    raise exception 'Only an administrator can read the audit log.'
      using errcode = '42501';
  end if;

  return query
    select l.id, l.at, l.actor_name, l.action, l.subject_name, l.subject_course, l.detail
    from public.admin_audit_log l
    order by l.at desc, l.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- ------------------------------------------------------------------ grants

-- No INSERT, UPDATE or DELETE reaches a client role. The writer is definer-only
-- and is not callable from outside the four functions above.
revoke all on function public.write_admin_audit(text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_audit_trail(integer) from public, anon;
grant execute on function public.admin_audit_trail(integer) to authenticated;

comment on table public.admin_audit_log is
  'Append-only record of administrator actions. Written only by the definer functions that perform them; readable by administrators.';
