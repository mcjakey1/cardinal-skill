-- Separate private student practice from instructor-authored official courses
-- and explicitly published student community courses. This migration adds the
-- classification boundary only; public discovery policies arrive with the
-- catalog flow, so applying it cannot expose an existing course.

alter table public.courses
  add column course_kind text not null default 'practice',
  add column publication_status text not null default 'draft',
  add column discoverability text not null default 'private',
  add column source_course_id uuid references public.courses(id) on delete set null,
  add column published_at timestamptz;

alter table public.courses
  add constraint courses_course_kind_check
    check (course_kind in ('practice', 'official', 'community')),
  add constraint courses_publication_status_check
    check (publication_status in ('draft', 'published', 'archived')),
  add constraint courses_discoverability_check
    check (discoverability in ('private', 'unlisted', 'public')),
  add constraint courses_source_is_different_check
    check (source_course_id is null or source_course_id <> id),
  add constraint courses_distribution_state_check check (
    (
      course_kind = 'practice'
      and publication_status = 'draft'
      and discoverability = 'private'
      and published_at is null
    )
    or (
      course_kind in ('official', 'community')
      and publication_status = 'draft'
      and discoverability = 'private'
      and published_at is null
    )
    or (
      course_kind = 'official'
      and publication_status = 'published'
      and discoverability = 'public'
      and published_at is not null
    )
    or (
      course_kind = 'community'
      and publication_status = 'published'
      and discoverability in ('unlisted', 'public')
      and published_at is not null
    )
    or (
      course_kind in ('official', 'community')
      and publication_status = 'archived'
      and discoverability = 'private'
    )
  );

-- The role selected during sign-up lives in user metadata and is useful for
-- routing, but a user can change it. Official publishing therefore requires a
-- separate server-managed verification record with no authenticated writes.
create table public.verified_instructors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now(),
  verified_by uuid references auth.users(id) on delete set null
);

alter table public.verified_instructors enable row level security;

create policy "read own instructor verification"
  on public.verified_instructors
  for select
  using (user_id = auth.uid());

-- Existing instructor-owned courses become private official drafts. Existing
-- student-owned courses retain the conservative private-practice default.
update public.courses c
set course_kind = 'official'
from auth.users u
where u.id = c.owner_id
  and u.raw_user_meta_data ->> 'role' = 'instructor';

create index courses_distribution_idx
  on public.courses (course_kind, publication_status, discoverability);

create or replace function public.enforce_course_distribution_authority()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_verified_instructor boolean;
begin
  -- Migrations and trusted server maintenance have no end-user auth context.
  if auth.uid() is null then
    return new;
  end if;

  select exists (
    select 1
    from public.verified_instructors vi
    where vi.user_id = auth.uid()
  ) into v_is_verified_instructor;

  if new.course_kind = 'official' and not v_is_verified_instructor then
    raise exception 'Only a verified instructor can create or publish an official course.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger enforce_course_distribution_authority
  before insert or update of course_kind, publication_status, discoverability, published_at
  on public.courses
  for each row execute function public.enforce_course_distribution_authority();

revoke all on function public.enforce_course_distribution_authority() from public;

-- Preserve the established atomic graph fork, then mark its result as an
-- attributed private practice course. Keeping this as a wrapper avoids two
-- clients racing between a copy and a follow-up classification update.
create or replace function public.fork_course_as_practice(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_new_course_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in before creating a practice copy.' using errcode = '42501';
  end if;

  v_new_course_id := public.fork_course(p_course_id);

  update public.courses
  set course_kind = 'practice',
      publication_status = 'draft',
      discoverability = 'private',
      source_course_id = p_course_id,
      published_at = null
  where id = v_new_course_id
    and owner_id = v_user_id;

  if not found then
    raise exception 'The practice copy could not be classified.';
  end if;

  return v_new_course_id;
end;
$$;

revoke all on function public.fork_course_as_practice(uuid) from public;
grant execute on function public.fork_course_as_practice(uuid) to authenticated;

comment on column public.courses.course_kind is
  'practice is a private editable copy; official is instructor-authored; community is student-authored shared content.';
comment on column public.courses.source_course_id is
  'Attribution for a practice or community fork. The copy owns independent nodes, missions, progress, and XP.';
comment on column public.courses.discoverability is
  'Catalog visibility. RLS remains private until the corresponding publish/catalog migration is installed.';
