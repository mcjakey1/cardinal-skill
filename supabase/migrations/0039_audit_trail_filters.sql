-- A record you can ask a narrower question of.
--
-- 0036's `admin_audit_trail(integer)` returns the newest hundred rows and
-- nothing else. That was enough while the log held only four kinds of
-- administrator action; with instructor work in it (0037) and chart publishes
-- (0038) it is a hundred rows off the top of a table nobody can search.
--
-- WHY THE PREDICATE IS HERE AND NOT IN THE CLIENT
--   A filter applied in the app would only ever see the page already loaded. A
--   search that found nothing would mean "not in these hundred rows", and the
--   screen would show it as "not in the record". Those are different answers,
--   and an audit log that confuses them is worse than one with no search at
--   all. Every narrowing below is a `where` clause, so "no match" means no
--   match.
--
-- WHY A NEW NAME AND A DROP
--   The return type changes — the ids the screen needs to open a course or a
--   roster were never in it — and `create or replace` cannot change a function's
--   return type. Dropped and recreated, the way 0031 does. The name loses its
--   `admin_` prefix for the same reason 0037 stops the table being only about
--   administrators; the authority check in the body is unchanged, and it is
--   still the only thing granting access.
--
-- WHO MAY READ IT
--   Exactly who could before: an administrator. 0036's single select policy
--   stands, and this function re-states the check in its own body the way
--   `course_roster` does. An instructor may not read the log, not even the rows
--   where they are the actor — a second reader class means every column added
--   from here on has to be checked against two audiences, including `detail`,
--   which is a free-form blob. A student seeing who changed their own enrolment
--   is the stronger case and is a product decision, not a policy tweak.
--
-- NO NEW INDEX. `admin_audit_log_at_idx (at desc)` already serves the keyset
-- order, and every filter narrows a scan over a table that grows by staff
-- actions. The free-text search is unindexed `ilike`, which is fine to roughly
-- 100k rows; the upgrade is a `pg_trgm` GIN over the three name columns, and it
-- should wait for a slow query to point at.

drop function public.admin_audit_trail(integer);

create function public.audit_trail(
  p_actor          uuid        default null,
  p_actions        text[]      default null,
  p_from           timestamptz default null,
  p_to             timestamptz default null,
  p_search         text        default null,
  p_subject_user   uuid        default null,
  p_subject_course uuid        default null,
  p_before_at      timestamptz default null,
  p_before_id      bigint      default null,
  p_limit          integer     default 100
)
returns table (
  id                bigint,
  at                timestamptz,
  actor_id          uuid,
  actor_name        text,
  actor_role        text,
  action            text,
  subject_user_id   uuid,
  subject_name      text,
  subject_course_id uuid,
  course_title      text,
  detail            jsonb
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
    select l.id, l.at, l.actor_id, l.actor_name, l.actor_role, l.action,
           l.subject_user_id, l.subject_name, l.subject_course_id,
           l.subject_course, l.detail
    from public.admin_audit_log l
    -- Every filter is "not asked for, or matched", so a call with no arguments
    -- returns exactly what 0036's function returned.
    where (p_actor is null or l.actor_id = p_actor)
      and (p_actions is null or l.action = any (p_actions))
      and (p_from is null or l.at >= p_from)
      and (p_to is null or l.at <= p_to)
      and (p_subject_user is null or l.subject_user_id = p_subject_user)
      and (p_subject_course is null or l.subject_course_id = p_subject_course)
      and (
        p_search is null
        or l.actor_name     ilike '%' || p_search || '%'
        or l.subject_name   ilike '%' || p_search || '%'
        or l.subject_course ilike '%' || p_search || '%'
      )
      -- Keyset, and on the pair. One transaction writing two rows gives them
      -- the same `now()`, so a cursor on `at` alone steps over whichever of
      -- them came second and the reader never learns it existed.
      and (
        p_before_at is null or p_before_id is null
        or (l.at, l.id) < (p_before_at, p_before_id)
      )
    order by l.at desc, l.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.audit_trail(
  uuid, text[], timestamptz, timestamptz, text, uuid, uuid, timestamptz, bigint, integer
) from public, anon;

grant execute on function public.audit_trail(
  uuid, text[], timestamptz, timestamptz, text, uuid, uuid, timestamptz, bigint, integer
) to authenticated;
