-- Published course discovery and enrollment. Catalog readers receive only the
-- metadata returned by these functions; no broad courses SELECT policy is
-- added, so private practice and unlisted community courses cannot leak into a
-- modified client's public browse query.

alter table public.courses
  add column share_code text unique;

alter table public.courses
  add constraint courses_share_code_length_check
    check (share_code is null or char_length(share_code) between 16 and 64),
  add constraint courses_share_code_kind_check
    check (share_code is null or course_kind = 'community');

create index courses_public_catalog_idx
  on public.courses (course_kind, published_at desc)
  where publication_status = 'published' and discoverability = 'public';

create or replace function public.prevent_shared_course_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.course_kind in ('official', 'community') then
    raise exception 'Archive a shared course instead of deleting learner records.'
      using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger prevent_shared_course_delete
  before delete on public.courses
  for each row execute function public.prevent_shared_course_delete();

revoke all on function public.prevent_shared_course_delete() from public;

create or replace function public.publish_community_course(
  p_course_id uuid,
  p_discoverability text default 'unlisted'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_share_code text;
begin
  if v_user_id is null then
    raise exception 'Sign in before sharing a course.' using errcode = '42501';
  end if;
  if p_discoverability not in ('unlisted', 'public') then
    raise exception 'Community visibility must be unlisted or public.';
  end if;

  update public.courses c
  set course_kind = 'community',
      publication_status = 'published',
      discoverability = p_discoverability,
      published_at = now(),
      share_code = coalesce(c.share_code, encode(gen_random_bytes(12), 'hex'))
  where c.id = p_course_id
    and c.owner_id = v_user_id
    and c.course_kind in ('practice', 'community')
  returning c.share_code into v_share_code;

  if v_share_code is null then
    raise exception 'Only the owner of a practice or community course can share it.'
      using errcode = '42501';
  end if;

  -- Authors may inspect progress but do not compete against their learners.
  insert into public.enrollments (user_id, course_id, role)
  values (v_user_id, p_course_id, 'instructor')
  on conflict (user_id, course_id) do update set role = excluded.role;

  return v_share_code;
end;
$$;

create or replace function public.publish_official_course(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not exists (
    select 1 from public.verified_instructors vi where vi.user_id = v_user_id
  ) then
    raise exception 'Only a verified instructor can publish an official course.'
      using errcode = '42501';
  end if;

  update public.courses c
  set course_kind = 'official',
      publication_status = 'published',
      discoverability = 'public',
      published_at = now(),
      share_code = null
  where c.id = p_course_id and c.owner_id = v_user_id;

  if not found then
    raise exception 'Only the course owner can publish this official course.'
      using errcode = '42501';
  end if;

  insert into public.enrollments (user_id, course_id, role)
  values (v_user_id, p_course_id, 'instructor')
  on conflict (user_id, course_id) do update set role = excluded.role;
end;
$$;

create or replace function public.archive_shared_course(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before archiving a shared course.' using errcode = '42501';
  end if;

  update public.courses c
  set publication_status = 'archived',
      discoverability = 'private'
  where c.id = p_course_id
    and c.owner_id = auth.uid()
    and c.course_kind in ('official', 'community');

  if not found then
    raise exception 'Only the owner can archive this shared course.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.course_catalog(p_course_kind text)
returns table (
  course_id uuid,
  course_code text,
  title text,
  term text,
  description text,
  units smallint,
  course_kind text,
  owner_display_name text,
  learner_count integer,
  is_joined boolean,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to browse courses.' using errcode = '42501';
  end if;
  if p_course_kind not in ('official', 'community') then
    raise exception 'Catalog kind must be official or community.';
  end if;

  return query
  select
    c.id,
    c.course_code,
    c.title,
    c.term,
    c.description,
    c.units,
    c.course_kind,
    coalesce(
      nullif(p.display_name, ''),
      case when c.course_kind = 'official' then 'Verified instructor' else 'Student author' end
    ),
    (
      select count(*)::integer
      from public.enrollments learners
      where learners.course_id = c.id
        and learners.role = 'student'
        and learners.user_id <> c.owner_id
    ),
    exists (
      select 1 from public.enrollments mine
      where mine.course_id = c.id and mine.user_id = auth.uid()
    ),
    c.published_at
  from public.courses c
  left join public.profiles p on p.id = c.owner_id
  where c.course_kind = p_course_kind
    and c.publication_status = 'published'
    and c.discoverability = 'public'
  order by c.published_at desc, c.title, c.id;
end;
$$;

create or replace function public.resolve_shared_course(p_share_code text)
returns table (
  course_id uuid,
  course_code text,
  title text,
  term text,
  description text,
  units smallint,
  course_kind text,
  owner_display_name text,
  learner_count integer,
  is_joined boolean,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.course_code,
    c.title,
    c.term,
    c.description,
    c.units,
    c.course_kind,
    coalesce(nullif(p.display_name, ''), 'Student author'),
    (
      select count(*)::integer from public.enrollments learners
      where learners.course_id = c.id
        and learners.role = 'student'
        and learners.user_id <> c.owner_id
    ),
    exists (
      select 1 from public.enrollments mine
      where mine.course_id = c.id and mine.user_id = auth.uid()
    ),
    c.published_at
  from public.courses c
  left join public.profiles p on p.id = c.owner_id
  where auth.uid() is not null
    and c.course_kind = 'community'
    and c.publication_status = 'published'
    and c.discoverability in ('unlisted', 'public')
    and c.share_code = lower(trim(p_share_code));
$$;

create or replace function public.join_published_course(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in before joining a course.' using errcode = '42501';
  end if;

  select c.owner_id into v_owner_id
  from public.courses c
  where c.id = p_course_id
    and c.course_kind in ('official', 'community')
    and c.publication_status = 'published'
    and c.discoverability in ('unlisted', 'public');

  if v_owner_id is null then
    raise exception 'This shared course is not available to join.';
  end if;
  if v_owner_id = v_user_id then
    raise exception 'Course authors do not join their own learner leaderboard.';
  end if;

  insert into public.enrollments (user_id, course_id, role)
  values (v_user_id, p_course_id, 'student')
  on conflict (user_id, course_id) do update set role = excluded.role;

  return p_course_id;
end;
$$;

revoke all on function public.publish_community_course(uuid, text) from public;
revoke all on function public.publish_official_course(uuid) from public;
revoke all on function public.archive_shared_course(uuid) from public;
revoke all on function public.course_catalog(text) from public;
revoke all on function public.resolve_shared_course(text) from public;
revoke all on function public.join_published_course(uuid) from public;

grant execute on function public.publish_community_course(uuid, text) to authenticated;
grant execute on function public.publish_official_course(uuid) to authenticated;
grant execute on function public.archive_shared_course(uuid) to authenticated;
grant execute on function public.course_catalog(text) to authenticated;
grant execute on function public.resolve_shared_course(text) to authenticated;
grant execute on function public.join_published_course(uuid) to authenticated;
