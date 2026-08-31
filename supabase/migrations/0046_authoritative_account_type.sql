-- The administrator-managed account type is authoritative.
--
-- Legacy verification and official-course ownership repaired accounts before
-- protected app metadata existed. Once an administrator explicitly chooses a
-- type, that protected value must win; otherwise courses created during the
-- historical role bug make an instructor promotion permanent.

create or replace function public.effective_account_type(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_administrator(p_user_id) then 'instructor'
    when u.raw_app_meta_data ->> 'account_type' in ('student', 'instructor')
      then u.raw_app_meta_data ->> 'account_type'
    when public.is_verified_instructor(p_user_id)
      or exists (
        select 1 from public.courses c
        where c.owner_id = p_user_id and c.course_kind = 'official'
      )
      or u.raw_user_meta_data ->> 'role' = 'instructor'
      then 'instructor'
    else 'student'
  end
  from auth.users u
  where u.id = p_user_id;
$$;

-- Revoke stale teaching authority for every account explicitly set to student.
-- The row stays as the durable record that prevents accidental re-verification.
insert into public.verified_instructors (user_id, revoked_at)
select u.id, now()
from auth.users u
where u.deleted_at is null
  and u.raw_app_meta_data ->> 'account_type' = 'student'
on conflict (user_id) do update
  set revoked_at = coalesce(public.verified_instructors.revoked_at, excluded.revoked_at),
      revoked_by = coalesce(public.verified_instructors.revoked_by, excluded.revoked_by);

create or replace function public.admin_account_directory()
returns table (
  user_id uuid,
  display_name text,
  email text,
  account_type text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_administrator() then
    raise exception 'Only an administrator can read account types.'
      using errcode = '42501';
  end if;

  return query
    select
      u.id,
      coalesce(
        nullif(p.display_name, ''),
        nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
        'Unnamed account'
      )::text,
      coalesce(u.email, '')::text,
      public.effective_account_type(u.id)
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.deleted_at is null
      and not public.is_administrator(u.id)
    order by 2, 3, 1;
end;
$$;

create or replace function public.admin_set_account_type(
  p_user_id uuid,
  p_account_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before text;
begin
  if not public.is_administrator() then
    raise exception 'Only an administrator can change an account type.'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Name the account whose type you are changing.';
  end if;
  if p_account_type not in ('student', 'instructor') then
    raise exception 'An account type is student or instructor.';
  end if;
  if public.is_administrator(p_user_id) then
    raise exception 'Administrator account types cannot be changed here.'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = p_user_id and u.deleted_at is null
  ) then
    raise exception 'That account does not exist.';
  end if;

  v_before := public.effective_account_type(p_user_id);

  update auth.users
  set raw_app_meta_data = jsonb_set(
        coalesce(raw_app_meta_data, '{}'::jsonb),
        '{account_type}', to_jsonb(p_account_type), true),
      raw_user_meta_data = jsonb_set(
        coalesce(raw_user_meta_data, '{}'::jsonb),
        '{role}', to_jsonb(p_account_type), true)
  where id = p_user_id;

  if p_account_type = 'instructor' then
    insert into public.verified_instructors (user_id, verified_by)
    values (p_user_id, auth.uid())
    on conflict (user_id) do update
      set revoked_at = null,
          revoked_by = null,
          verified_at = now(),
          verified_by = auth.uid();
  else
    insert into public.verified_instructors (user_id, verified_by, revoked_at, revoked_by)
    values (p_user_id, auth.uid(), now(), auth.uid())
    on conflict (user_id) do update
      set revoked_at = now(),
          revoked_by = auth.uid();
  end if;

  if v_before is distinct from p_account_type then
    perform public.write_admin_audit(
      'account.role_changed', p_user_id, null,
      jsonb_build_object('from', v_before, 'to', p_account_type));
  end if;
end;
$$;

revoke all on function public.effective_account_type(uuid) from public, anon, authenticated;
revoke all on function public.admin_account_directory() from public, anon;
revoke all on function public.admin_set_account_type(uuid, text) from public, anon;
grant execute on function public.admin_account_directory() to authenticated;
grant execute on function public.admin_set_account_type(uuid, text) to authenticated;

comment on function public.effective_account_type(uuid) is
  'Returns the protected account type, using legacy evidence only when that type is absent.';
comment on function public.admin_set_account_type(uuid, text) is
  'Makes the protected account type authoritative and synchronizes instructor verification without course-ownership lock-in.';
