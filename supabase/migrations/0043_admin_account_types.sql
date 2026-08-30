-- Administrator-managed account types.
--
-- The role chosen at sign-up originally lived only in raw_user_meta_data. A
-- signed-in user may edit that bag, so it is useful onboarding input but cannot
-- remain the authority for routing. `account_type` is copied into app metadata,
-- which only trusted database/server code may change, and every admin mutation
-- below re-checks the administrators table in its own body.

-- Give every existing account an authoritative type before clients begin
-- preferring app metadata. Existing server evidence wins over the old sign-up
-- claim so a real instructor is never silently placed in the student tab.
update auth.users u
set raw_app_meta_data = jsonb_set(
  coalesce(u.raw_app_meta_data, '{}'::jsonb),
  '{account_type}',
  to_jsonb(
    case
      when public.is_verified_instructor(u.id)
        or exists (
          select 1 from public.courses c
          where c.owner_id = u.id and c.course_kind = 'official'
        )
        or u.raw_user_meta_data ->> 'role' = 'instructor'
      then 'instructor'
      else 'student'
    end::text
  ),
  true
);

-- New sign-ups get the same protected copy. The trigger remains AFTER INSERT:
-- verification needs the auth.users row to exist before its foreign key can be
-- written, and there is no auth.users UPDATE trigger here to recurse into.
create or replace function public.verify_instructor_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := case
    when new.raw_user_meta_data ->> 'role' = 'instructor' then 'instructor'
    else 'student'
  end;
  v_granted boolean := false;
begin
  update auth.users
  set raw_app_meta_data = jsonb_set(
    coalesce(raw_app_meta_data, '{}'::jsonb),
    '{account_type}',
    to_jsonb(v_role),
    true
  )
  where id = new.id;

  if v_role = 'instructor' then
    insert into public.verified_instructors (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
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
        '{"at_signup": true}'::jsonb,
        'owner');
    end if;
  end if;
  return new;
end;
$$;

-- The directory is one security-definer read because profiles do not contain
-- email addresses and authenticated clients cannot read auth.users directly.
-- Administrators are excluded here, so a modified client cannot offer a global
-- role change for an account that holds site-wide authority.
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
      case
        when public.is_verified_instructor(u.id)
          or exists (
            select 1 from public.courses c
            where c.owner_id = u.id and c.course_kind = 'official'
          )
          or coalesce(u.raw_app_meta_data ->> 'account_type', u.raw_user_meta_data ->> 'role') = 'instructor'
        then 'instructor'
        else 'student'
      end::text
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.deleted_at is null
      and not public.is_administrator(u.id)
    order by 2, 3, 1;
end;
$$;

alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check
  check (action in (
    'course.created',
    'course.published',
    'course.unpublished',
    'course.archived',
    'course.renamed',
    'course.owner_changed',
    'course.deleted',
    'chart.published',
    'mission.edited',
    'instructor.verified',
    'instructor.revoked',
    'enrollment.added',
    'enrollment.removed',
    'enrollment.role_changed',
    'administrator.granted',
    'administrator.revoked',
    'account.role_changed'
  ));

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
  if not exists (select 1 from auth.users u where u.id = p_user_id and u.deleted_at is null) then
    raise exception 'That account does not exist.';
  end if;

  select case
    when public.is_verified_instructor(p_user_id)
      or exists (
        select 1 from public.courses c
        where c.owner_id = p_user_id and c.course_kind = 'official'
      )
      or coalesce(u.raw_app_meta_data ->> 'account_type', u.raw_user_meta_data ->> 'role') = 'instructor'
    then 'instructor'
    else 'student'
  end
  into v_before
  from auth.users u
  where u.id = p_user_id;

  if v_before = p_account_type then
    return;
  end if;

  if p_account_type = 'student' and exists (
    select 1 from public.courses c
    where c.owner_id = p_user_id and c.course_kind = 'official'
  ) then
    raise exception 'Transfer or archive this instructor''s official courses before changing the account to student.'
      using errcode = '42501';
  end if;

  update auth.users
  set raw_app_meta_data = jsonb_set(
        coalesce(raw_app_meta_data, '{}'::jsonb),
        '{account_type}',
        to_jsonb(p_account_type),
        true),
      raw_user_meta_data = jsonb_set(
        coalesce(raw_user_meta_data, '{}'::jsonb),
        '{role}',
        to_jsonb(p_account_type),
        true)
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

  perform public.write_admin_audit(
    'account.role_changed',
    p_user_id,
    null,
    jsonb_build_object('from', v_before, 'to', p_account_type));
end;
$$;

revoke all on function public.admin_account_directory() from public, anon;
revoke all on function public.admin_set_account_type(uuid, text) from public, anon;
grant execute on function public.admin_account_directory() to authenticated;
grant execute on function public.admin_set_account_type(uuid, text) to authenticated;

comment on function public.admin_account_directory() is
  'Every non-administrator account with its effective global type, readable only by administrators.';
comment on function public.admin_set_account_type(uuid, text) is
  'Changes a non-administrator account between student and instructor, synchronizing protected metadata and verification.';
