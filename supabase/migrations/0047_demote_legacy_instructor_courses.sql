-- Finish role demotion for accounts affected by the historical promotion bug.
-- An old client treats official-course ownership as instructor evidence, so a
-- student demotion must also turn those legacy courses into private practice
-- uploads. Newer clients already trust protected account metadata first.

do $$
declare
  v_user_id uuid;
  v_name text;
begin
  select u.id, coalesce(nullif(p.display_name, ''), u.email, 'Venedict Galicia')
    into v_user_id, v_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(u.email) = 'venedictgalicia20@gmail.com'
    and u.deleted_at is null;

  if v_user_id is null then
    raise exception 'The Venedict Galicia account was not found; no role data was changed.';
  end if;

  update auth.users
  set raw_app_meta_data = jsonb_set(
        coalesce(raw_app_meta_data, '{}'::jsonb),
        '{account_type}', '"student"'::jsonb, true),
      raw_user_meta_data = jsonb_set(
        coalesce(raw_user_meta_data, '{}'::jsonb),
        '{role}', '"student"'::jsonb, true)
  where id = v_user_id;

  insert into public.verified_instructors (user_id, revoked_at)
  values (v_user_id, now())
  on conflict (user_id) do update
    set revoked_at = now(),
        revoked_by = null;

  update public.courses
  set course_kind = 'practice',
      publication_status = 'draft',
      discoverability = 'private',
      published_at = null
  where owner_id = v_user_id
    and course_kind = 'official';

  insert into public.admin_audit_log (
    actor_id, actor_name, actor_role, action,
    subject_user_id, subject_name, detail
  ) values (
    null, 'Cardinal Skill migration', 'administrator', 'account.role_changed',
    v_user_id, v_name,
    jsonb_build_object(
      'from', 'instructor',
      'to', 'student',
      'reason', 'Corrected the historical automatic-promotion bug')
  );
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

    update public.courses
    set course_kind = 'practice',
        publication_status = 'draft',
        discoverability = 'private',
        published_at = null
    where owner_id = p_user_id
      and course_kind = 'official';
  end if;

  if v_before is distinct from p_account_type then
    perform public.write_admin_audit(
      'account.role_changed', p_user_id, null,
      jsonb_build_object('from', v_before, 'to', p_account_type));
  end if;
end;
$$;

revoke all on function public.admin_set_account_type(uuid, text) from public, anon;
grant execute on function public.admin_set_account_type(uuid, text) to authenticated;

comment on function public.admin_set_account_type(uuid, text) is
  'Changes the protected account type; student demotion also converts legacy official courses to private practice uploads.';
