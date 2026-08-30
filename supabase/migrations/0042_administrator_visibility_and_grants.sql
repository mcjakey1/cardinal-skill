-- Who else holds the keys, and how they got them.
--
-- 0036 through 0041 built a record of what an administrator does. This closes
-- the gap underneath it: the *granting* of authority was itself invisible.
--
-- Three findings from an administrator working through the real screens, in the
-- order they matter.
--
-- WHO ELSE IS AN ADMINISTRATOR
--   0028 gave `administrators` a single select policy, `user_id = auth.uid()`.
--   It is the right policy for an ordinary account — `isAdministrator()` asks
--   "am I one" and must not become a way to enumerate staff — but it means an
--   administrator opening the admin area sees a table containing exactly
--   themselves. There is no way to answer "who else can do this", which is the
--   first question anyone auditing a system asks, and the last one this schema
--   could answer.
--
--   Widened below to administrators only. An ordinary account still reads its
--   own row and nothing else, so the check every RPC makes is unchanged.
--
-- HOW SOMEBODY BECAME ONE
--   `admin_set_administrator` writes an audit row. Nothing calls it: the app
--   has no panel for it, so in practice every administrator is created by
--   direct SQL against the table — the one path that wrote nothing at all.
--   0028 is explicit that the first row must be inserted out of band, and that
--   is still true and still correct. What was wrong is that it left no trace.
--
--   A row trigger fixes both at once, because it fires for the RPC and the
--   out-of-band insert alike. The RPC's own `write_admin_audit` calls are
--   removed here so the trigger is the single writer, exactly as 0037 did for
--   courses and enrolments.
--
-- HOW SOMEBODY BECAME A VERIFIED INSTRUCTOR
--   0028 grants the badge from a trigger on sign-up to anyone who picks the
--   instructor role. That badge is what gates publishing to the whole catalog,
--   and it was granted with `verified_by` null and no audit row. The deliberate
--   openness is a product decision and is not changed here; the silence is not,
--   and is.
--
-- A NOTE ON `auth.uid()` BEING NULL
--   The out-of-band paths — the SQL editor, the service role, a migration —
--   have no signed-in user. `write_admin_audit` would file those as "An
--   administrator", which is worse than saying nothing: it invents a person.
--   The trigger below writes `Direct database access` instead, which is what
--   actually happened and what an auditor needs to see.

-- --------------------------------------------------- who else holds the keys

drop policy if exists "read own administrator record" on public.administrators;

-- An ordinary account reads its own row, which is what `isAdministrator()`
-- needs. An administrator reads all of them, which is what an audit needs.
-- Still no INSERT, UPDATE or DELETE for any client role: the RPC is the only
-- writer, and it re-checks authority in its own body.
create policy "read administrator records"
  on public.administrators
  for select
  using (user_id = auth.uid() or public.is_administrator());

-- ------------------------------------------------- granting is now recorded

create or replace function public.audit_administrator_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_target uuid := coalesce(new.user_id, old.user_id);
begin
  insert into public.admin_audit_log (
    actor_id, actor_name, action,
    subject_user_id, subject_name,
    detail, actor_role
  )
  values (
    v_actor,
    coalesce(
      nullif((select p.display_name from public.profiles p where p.id = v_actor), ''),
      (select u.email from auth.users u where u.id = v_actor),
      -- No session: the SQL editor, the service role, or a migration. Naming
      -- that plainly beats inventing an administrator who was not there.
      'Direct database access'),
    case when tg_op = 'INSERT' then 'administrator.granted' else 'administrator.revoked' end,
    v_target,
    coalesce(
      nullif((select p.display_name from public.profiles p where p.id = v_target), ''),
      (select u.email from auth.users u where u.id = v_target)),
    case
      when tg_op = 'INSERT' and v_actor is null then '{"out_of_band": true}'::jsonb
      else '{}'::jsonb
    end,
    'administrator');
  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_administrator_change() from public, anon, authenticated;

drop trigger if exists audit_administrator_change on public.administrators;
create trigger audit_administrator_change
  after insert or delete on public.administrators
  for each row execute function public.audit_administrator_change();

-- The trigger is now the single writer for this table, so the RPC stops
-- writing its own rows. Body otherwise identical to 0036's — the authority
-- check, the self-revocation refusal and the error text are unchanged.
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
  else
    if p_user_id = auth.uid() then
      -- Removing your own last access is not a moderation action, it is a
      -- lockout. Another administrator can do it.
      raise exception 'Ask another administrator to remove your own administrator status.'
        using errcode = '42501';
    end if;
    delete from public.administrators where user_id = p_user_id;
  end if;
end;
$$;

-- ------------------------------------------ the sign-up badge is now recorded

-- Unchanged in what it grants and to whom. 0028's reasoning stands: the badge
-- is open by design, and `do nothing` on conflict is load-bearing so a revoked
-- row survives a second sign-up. The only addition is the record.
create or replace function public.verify_instructor_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted boolean := false;
begin
  if new.raw_user_meta_data ->> 'role' = 'instructor' then
    insert into public.verified_instructors (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
    -- Only when a row was actually created. A revoked account signing up again
    -- changes nothing, and an audit row saying otherwise would be a false one.
    get diagnostics v_granted = row_count;

    if v_granted then
      insert into public.admin_audit_log (
        actor_id, actor_name, action,
        subject_user_id, subject_name,
        detail, actor_role
      )
      values (
        new.id,
        coalesce(new.email, 'A new account'),
        'instructor.verified',
        new.id,
        coalesce(new.email, 'A new account'),
        -- The distinguishing fact. An administrator reading this needs to know
        -- nobody decided it — the account asked for it at sign-up and the rule
        -- said yes.
        '{"at_signup": true}'::jsonb,
        'owner');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.verify_instructor_on_signup() from public, anon, authenticated;

-- ------------------------------------------------- the roster fallback again

-- 0041 stopped `course_roster`'s zero-enrolment fallback from listing staff. It
-- left the other half standing, and said so in its own comment: reaching the
-- list still costs only choosing the instructor tab at sign-up, because that is
-- what grants a badge. An administrator testing this signed up as an
-- instructor, created an empty course, and read five students' names and email
-- addresses — none of them on any course of theirs.
--
-- Taking 0041's own stated remedy: the fallback is now administrators only. A
-- verified instructor with nobody enrolled gets the refusal instead of a
-- directory, which is the honest answer — the enrolment write is what should
-- populate this, and until it exists the list is a directory wearing a roster's
-- name.
create or replace function public.course_roster(p_course_id uuid)
returns table (user_id uuid, display_name text, email text, enrolled boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_any_enrolled boolean;
begin
  if not public.can_administer_course(p_course_id) then
    raise exception 'Only the owner of a course can see its roster.'
      using errcode = '42501';
  end if;

  select exists (
    select 1 from public.enrollments e
    where e.course_id = p_course_id and e.role = 'student'
  ) into v_any_enrolled;

  if not v_any_enrolled and not public.is_administrator() then
    raise exception 'Nobody is enrolled on this course yet. Add students to it to see a roster.'
      using errcode = '42501';
  end if;

  return query
    select
      u.id,
      coalesce(nullif(p.display_name, ''), 'Unnamed student')::text,
      u.email::text,
      v_any_enrolled
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id <> v_caller
      and u.deleted_at is null
      and case
        when v_any_enrolled then
          exists (
            select 1 from public.enrollments e
            where e.course_id = p_course_id
              and e.user_id = u.id
              and e.role = 'student'
          )
        else
          not (public.is_verified_instructor(u.id) or public.is_administrator(u.id))
      end
    order by 2, 3;
end;
$$;

revoke all on function public.course_roster(uuid) from public, anon;
grant execute on function public.course_roster(uuid) to authenticated;

comment on function public.course_roster(uuid) is
  'Name and email for one course''s enrolled students, to its owner or an administrator. With nobody enrolled, only an administrator sees the registered-account fallback.';

comment on table public.administrators is
  'Who may act outside their own ownership. Readable by any administrator so authority can be audited; written only by admin_set_administrator or out of band, and every change is recorded in admin_audit_log.';
