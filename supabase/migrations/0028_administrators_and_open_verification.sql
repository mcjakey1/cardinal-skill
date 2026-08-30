-- Administrators, and instructor verification granted at sign-up.
--
-- THIS REVERSES A DECISION 0021 MADE ON PURPOSE, AND THE REASONING BELONGS HERE
-- RATHER THAN IN A COMMIT MESSAGE. 0021 says: the role chosen at sign-up lives
-- in user metadata, a user can change it, so official publishing requires a
-- separate server-managed record with no authenticated writes. That record kept
-- the official catalog — the one every student sees — closed until a human
-- opened it per account.
--
-- WHAT OPENS
--   Registering as an instructor now verifies the account. Anyone who can sign
--   up can publish an official course to every student, under the label
--   "Verified instructor". That is the product decision: the catalog is open by
--   default and moderated after the fact.
--
-- WHAT REPLACES THE CLOSED DOOR
--   An Administrator, who is the only account that may act outside its own
--   ownership, and who can revoke a verification and pull a course back out of
--   the catalog. For that remedy to mean anything, revocation has to outlast
--   anything the revoked account can do to itself:
--     * verification is granted by a trigger on INSERT into auth.users only, so
--       rewriting `role` in user metadata afterwards grants nothing;
--     * revocation is a `revoked_at` stamp on the row rather than the row's
--       absence, and the sign-up trigger does nothing on conflict, so a row that
--       has been revoked can never be recreated into a verified one.
--   Without both halves, a revoked user re-verifies themselves with one call to
--   `auth.updateUser` and the moderation story is theatre.
--
-- WHAT STAYS SHUT
--   * The administrators table has no authenticated write path, exactly as
--     verified_instructors had none. The first row is inserted out of band
--     through the Supabase dashboard; after that an Administrator may grant the
--     status to others through `admin_set_administrator`.
--   * Deleting a shared course. 0027 replaced `prevent_shared_course_delete`
--     with a delete policy that only ever matches a private practice draft,
--     because a row trigger could not tell an owner's delete from an account
--     erasure cascade. The administrator policies below are therefore SELECT,
--     INSERT and UPDATE only: a permissive FOR ALL policy would have handed an
--     Administrator the delete that 0022 and 0027 both took away, and the
--     cascade behind it erases learner records. Removal stays archival, through
--     `admin_set_course_publication`.
--   * Student writes. Nothing here lets anyone rewrite a student's progress.
--     Every read this grants an Administrator is a SELECT.
--   * Course-kind authority for ordinary accounts. An unverified, non-admin
--     caller still cannot create or publish an official course.

-- ----------------------------------------------------------- administrators

create table public.administrators (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

alter table public.administrators enable row level security;

-- The same shape verified_instructors uses: an account may learn whether it is
-- an administrator, and nothing else. Writes arrive through the definer
-- function below, never from a client.
create policy "read own administrator record"
  on public.administrators
  for select
  using (user_id = auth.uid());

create or replace function public.is_administrator(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and exists (
    select 1 from public.administrators a where a.user_id = p_user_id
  );
$$;

-- --------------------------------------------------- durable revocation

alter table public.verified_instructors
  add column revoked_at timestamptz,
  add column revoked_by uuid references auth.users(id) on delete set null;

-- A revoked row stays on the table. It is the record that stops the sign-up
-- trigger from ever granting this account verification again.
create or replace function public.is_verified_instructor(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and exists (
    select 1
    from public.verified_instructors vi
    where vi.user_id = p_user_id
      and vi.revoked_at is null
  );
$$;

-- ------------------------------------------------ verification at sign-up

create or replace function public.verify_instructor_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data ->> 'role' = 'instructor' then
    -- `do nothing` is the load-bearing half: a revoked row must survive a
    -- second sign-up attempt on the same account id.
    insert into public.verified_instructors (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

-- After insert only. An update trigger would re-grant verification to anyone
-- who edited their own metadata, which is precisely what revocation must
-- survive.
create trigger verify_instructor_on_signup
  after insert on auth.users
  for each row execute function public.verify_instructor_on_signup();

revoke all on function public.verify_instructor_on_signup() from public, anon;

-- Every instructor account that already exists is verified, matching the new
-- rule. Accounts already carrying a row keep it, revocation included.
insert into public.verified_instructors (user_id)
select u.id
from auth.users u
where u.raw_user_meta_data ->> 'role' = 'instructor'
on conflict (user_id) do nothing;

-- ------------------------------------------- the one exception to ownership

-- The predicate every course guard actually wants: the caller is the course's
-- responsible party. Owner, or the Administrator who answers for all of them.
create or replace function public.can_administer_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_administrator() or exists (
    select 1 from public.courses
    where id = p_course_id and owner_id = auth.uid()
  );
$$;

-- `owns_course` keeps its name because five migrations of policies and
-- functions call it — 0005's instructor reads, 0013's graph inserts, 0014's
-- archive impact, 0015's publish, 0018's mission details. Every one of those
-- sites asks "may this caller act on this course", and the Administrator is now
-- a caller who may. Redefining here is what makes that true in one place
-- instead of five; the name is kept, and this comment is the correction to it.
create or replace function owns_course(p_course_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_administer_course(p_course_id);
$$;

-- The profile read behind a roster. Same widening, same reason: an
-- Administrator may see a student's name wherever an instructor of record may.
create or replace function teaches_student(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_administrator() or exists (
    select 1
    from enrollments e
    join courses c on c.id = e.course_id
    where e.user_id = p_user_id
      and e.role = 'student'
      and c.owner_id = auth.uid()
  );
$$;

-- Writes on the graph tables. 0013 already grants these to a course's owner
-- through owns_course, so nodes, prerequisites and missions follow from the
-- redefinition above. Courses themselves are guarded by owner_id equality in
-- 0027's per-command policies, which no function call can widen — so an
-- Administrator needs policies of their own. Permissive policies are ORed, so
-- these add a second way to pass and take nothing from the first.
--
-- Read, create and update. Deliberately not DELETE: see the header. An
-- Administrator retires a course by archiving it, which is what preserves the
-- learner records hanging off it.
create policy "administrators read any course"
  on public.courses
  for select
  using (public.is_administrator());

create policy "administrators create any course"
  on public.courses
  for insert
  with check (public.is_administrator());

create policy "administrators update any course"
  on public.courses
  for update
  using (public.is_administrator())
  with check (public.is_administrator());

-- Enrolling and removing students on any course. Delete belongs here, unlike on
-- courses: an enrollment row carries no progress of its own, so removing one
-- takes access away and leaves the student's record whole.
create policy "administrators write any enrollment"
  on public.enrollments
  for all
  using (public.is_administrator())
  with check (public.is_administrator());

-- ------------------------------------------------------- authority rewrites

-- Unchanged from 0021 except that it reads through is_verified_instructor, so a
-- revoked account loses course-kind authority, and that an Administrator passes.
create or replace function public.enforce_course_distribution_authority()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Migrations and trusted server maintenance have no end-user auth context.
  if auth.uid() is null then
    return new;
  end if;

  if new.course_kind = 'official'
    and not public.is_verified_instructor()
    and not public.is_administrator()
  then
    raise exception 'Only a verified instructor can create or publish an official course.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Unchanged from 0022 except for the same two reads.
create or replace function public.publish_official_course(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
    or not (public.is_verified_instructor(v_user_id) or public.is_administrator(v_user_id))
  then
    raise exception 'Only a verified instructor can publish an official course.'
      using errcode = '42501';
  end if;

  update public.courses c
  set course_kind = 'official',
      publication_status = 'published',
      discoverability = 'public',
      published_at = now(),
      share_code = null
  where c.id = p_course_id
    and (c.owner_id = v_user_id or public.is_administrator(v_user_id));

  if not found then
    raise exception 'Only the course owner can publish this official course.'
      using errcode = '42501';
  end if;

  insert into public.enrollments (user_id, course_id, role)
  select c.owner_id, c.id, 'instructor'
  from public.courses c
  where c.id = p_course_id
  on conflict (user_id, course_id) do update set role = excluded.role;
end;
$$;

-- ------------------------------------------------------- administrator RPCs

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
  else
    -- The row stays, carrying the revocation. Deleting it would let the sign-up
    -- trigger grant verification again on the next account creation.
    insert into public.verified_instructors (user_id, verified_by, revoked_at, revoked_by)
    values (p_user_id, auth.uid(), now(), auth.uid())
    on conflict (user_id) do update
      set revoked_at = now(),
          revoked_by = auth.uid();
  end if;
end;
$$;

-- 0027 added a service-role provisioning boundary that revokes by DELETING the
-- row. That was right while a row's absence was the only state there was; it is
-- wrong now, because the sign-up trigger reads a missing row as "never granted"
-- and an erased revocation is one re-registration away from coming back. Same
-- function, same service_role boundary, same signature — the revocation branch
-- now stamps the row the way the administrator path does, so the two cannot
-- disagree about what revoked means.
create or replace function public.set_instructor_verification(
  p_user_id  uuid,
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
      set verified_at = now(),
          verified_by = auth.uid(),
          revoked_at = null,
          revoked_by = null;
  else
    insert into public.verified_instructors (user_id, verified_by, revoked_at, revoked_by)
    values (p_user_id, auth.uid(), now(), auth.uid())
    on conflict (user_id) do update
      set revoked_at = now(),
          revoked_by = auth.uid();
  end if;
end;
$$;

revoke all on function public.set_instructor_verification(uuid, boolean) from public, anon;
revoke all on function public.set_instructor_verification(uuid, boolean) from authenticated;
grant execute on function public.set_instructor_verification(uuid, boolean) to service_role;

comment on function public.set_instructor_verification(uuid, boolean) is
  'Service-role provisioning boundary for official-course instructors. Revocation is a stamp, not a delete.';

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

-- Publish, unpublish and archive any course. The state combinations here are
-- the ones courses_distribution_state_check accepts; anything else raises.
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

  select course_kind into v_kind from public.courses where id = p_course_id;
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
    -- Out of the catalog and back to the owner, with nothing published about it.
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

-- ------------------------------------------------------------------ grants

revoke all on function public.is_administrator(uuid) from public, anon;
revoke all on function public.is_verified_instructor(uuid) from public, anon;
revoke all on function public.can_administer_course(uuid) from public, anon;
revoke all on function public.admin_set_instructor_verification(uuid, boolean) from public, anon;
revoke all on function public.admin_set_administrator(uuid, boolean) from public, anon;
revoke all on function public.admin_set_course_publication(uuid, text) from public, anon;
revoke all on function public.admin_set_enrollment(uuid, uuid, boolean, text) from public, anon;

grant execute on function public.is_administrator(uuid) to authenticated;
grant execute on function public.is_verified_instructor(uuid) to authenticated;
grant execute on function public.can_administer_course(uuid) to authenticated;
grant execute on function public.admin_set_instructor_verification(uuid, boolean) to authenticated;
grant execute on function public.admin_set_administrator(uuid, boolean) to authenticated;
grant execute on function public.admin_set_course_publication(uuid, text) to authenticated;
grant execute on function public.admin_set_enrollment(uuid, uuid, boolean, text) to authenticated;
