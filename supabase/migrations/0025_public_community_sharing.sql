-- Community sharing has one understandable state: publicly discoverable.
-- Course ownership already excludes authors from learner ladders, so publishing
-- must not mutate the author's enrollment as a second, failure-prone side effect.

update public.courses
set discoverability = 'public'
where course_kind = 'community'
  and publication_status = 'published'
  and discoverability = 'unlisted';

create or replace function public.publish_community_course(
  p_course_id uuid,
  p_discoverability text default 'public'
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
    raise exception 'Sign in before publishing to Community.' using errcode = '42501';
  end if;
  if p_discoverability <> 'public' then
    raise exception 'Community courses must be publicly discoverable.' using errcode = '22023';
  end if;

  update public.courses c
  set course_kind = 'community',
      publication_status = 'published',
      discoverability = 'public',
      published_at = now(),
      share_code = coalesce(c.share_code, encode(gen_random_bytes(12), 'hex'))
  where c.id = p_course_id
    and c.owner_id = v_user_id
    and c.course_kind in ('practice', 'community')
  returning c.share_code into v_share_code;

  if v_share_code is null then
    raise exception 'Only the owner of a Playground course can publish it to Community.'
      using errcode = '42501';
  end if;

  return v_share_code;
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
    c.owner_id = auth.uid() or exists (
      select 1 from public.enrollments mine
      where mine.course_id = c.id and mine.user_id = auth.uid()
    ),
    c.published_at
  from public.courses c
  left join public.profiles p on p.id = c.owner_id
  where auth.uid() is not null
    and c.course_kind = 'community'
    and c.publication_status = 'published'
    and c.discoverability = 'public'
    and c.share_code = lower(trim(p_share_code));
$$;

revoke all on function public.publish_community_course(uuid, text) from public;
revoke all on function public.resolve_shared_course(text) from public;
grant execute on function public.publish_community_course(uuid, text) to authenticated;
grant execute on function public.resolve_shared_course(text) to authenticated;

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
    c.owner_id = auth.uid() or exists (
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

revoke all on function public.course_catalog(text) from public;
grant execute on function public.course_catalog(text) to authenticated;
