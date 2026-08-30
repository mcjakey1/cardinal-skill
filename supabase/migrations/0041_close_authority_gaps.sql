-- Seven places an account reached past the authority it was given.
--
-- Each was observed on a running database, not inferred from a reading of the
-- SQL, and each is a rule that was written down correctly in a comment and
-- enforced incorrectly in the statement under it. That is why this is one
-- migration rather than seven: the same three mistakes recur, and a reader who
-- fixes one should be able to see the other six.
--
-- THE THREE MISTAKES
--   1. `revoke all ... from public` is not a closed door. Supabase grants
--      EXECUTE on every new function to `anon` and `authenticated` explicitly,
--      and revoking from PUBLIC leaves both of those grants standing. 0023 and
--      0033 revoked from `public` alone and then described the result as
--      internal. It was not: every predicate they meant to keep behind a
--      definer boundary was one client call away. 0036 got this right at its
--      `write_admin_audit` — `from public, anon, authenticated` — and that line
--      is the model followed at the bottom of this file.
--   2. A helper whose meaning was widened underneath a policy that still reads
--      as though it were narrow. 0028 redefined `owns_course` to mean
--      owner-or-administrator, on behalf of the five migrations that call it.
--      0013's node DELETE is one of those call sites and was never meant to be.
--   3. A test written against a schema that has since changed shape. 0033's
--      instructor exclusion asks for a row in `verified_instructors`; 0028 made
--      revocation a stamp that keeps the row. The clause now reads "was ever an
--      instructor" where it means "is one".
--
-- WHAT THIS DOES NOT DO
--   * It does not revoke `anon` from the functions that were deliberately
--     granted to `authenticated`. Each of those checks `auth.uid()` in its own
--     body and refuses a caller without one, and `resolve_shared_course` and
--     `course_catalog` may yet be wanted for a signed-out visitor. That is a
--     product question, not a defect, and it is not settled here.
--   * It does not narrow the prerequisite-edge policies 0013 added alongside
--     the node DELETE. Deleting an edge cascades nothing and destroys no
--     learner record, which is the distinction 0028 drew when it withheld
--     DELETE on courses while granting INSERT and UPDATE. Deleting a node does
--     cascade, which is why it is the one being taken back.
--   * It does not forbid an administrator from transferring a course. That is
--     sometimes the right act — an instructor leaves and their students stay.
--     What was wrong is that it happened in silence, so it is recorded now.
--     Pinning `owner_id` in the admin UPDATE policy's `with check` was
--     considered and rejected: a WITH CHECK sees only the new row, so saying
--     "unchanged" there means a subquery reading the same table back in the
--     middle of the statement that is changing it. A policy should not be that
--     clever, and the trigger below is where the question already has an answer.

-- ------------------------------------------------------- 0013: the node DELETE

-- 0013 wrote this as `owns_course(course_id)`, fifteen migrations before 0028
-- gave that helper a second meaning. The sibling UPDATE policy from 0002 spells
-- the owner test out inline, so administrator write access to a course's graph
-- has been delete-only ever since — an asymmetry nobody chose, and the clearest
-- evidence that the widening here was accidental. 0035 then supplied the SELECT
-- that makes another instructor's node ids findable, and said in its own header
-- that it granted no DELETE. It did, through here.
--
-- Observed: an administrator ran `delete from skill_nodes` on a published
-- course belonging to another instructor. The node went, and with it the
-- missions on it, the learner `mission_progress` hanging off those, and the
-- `help_requests` naming it. The audit log recorded nothing — deleting a whole
-- course is an event, a node taken out from under one is not.
--
-- Spelled inline, in 0002's words, so the two halves of one permission cannot
-- drift apart again.
drop policy "course owner deletes nodes" on public.skill_nodes;

create policy "course owner deletes nodes" on public.skill_nodes
  for delete using (
    exists (select 1 from public.courses c
            where c.id = skill_nodes.course_id and c.owner_id = auth.uid())
  );

-- --------------------------------------------- 0004: who may re-price a node

-- 0004's authority check is "the owner, or anybody enrolled". It was written in
-- a product where enrolment meant an instructor had put you on a roster. 0022
-- made it self-service: anyone can find a published course in the catalog and
-- join it with one call.
--
-- Observed: an account with no relationship to a course joined it from the
-- catalog and then re-priced the owner's node from 60 XP to 10 and grafted two
-- nodes into a published official course, permanently, and unaudited.
--
-- THE CHOICE, AND WHY
--   The alternative was owner-only. That is the tighter rule and it is the
--   wrong one, because it deletes the feature. `help_requests.requester` has a
--   'student' value that 0004 derives from ownership precisely because a stuck
--   student asking for scaffolding is the case this function exists to serve;
--   an owner-only gate makes that column dead.
--
--   So: the owner, or a caller enrolled with role 'student' on a course that is
--   not `official`. Two conditions, each answering something "enrolled" no
--   longer can.
--
--   The role, because 0022's join writes 'student' and 0028's
--   `admin_set_enrollment` can write 'instructor'. Enrolment alone stopped
--   distinguishing a learner from a colleague placed on the course.
--
--   The kind, because `official` is the one whose content is an institution's
--   record of a course and whose catalog listing is open to every account. A
--   community course is shared on the understanding that its learners shape it
--   — that is what community distribution means here — and a practice course is
--   private to its owner, so the owner branch already covers it and this one
--   never fires for it.
--
-- Everything else is 0004's, unchanged: the conservation invariant, the subtree
-- containment checks, the mission re-pricing rules and their messages. A diff
-- against 0004 should show only the gate.
create or replace function public.request_help_subtree(
  p_node_id       uuid,
  p_parent_reward integer,
  p_steps         jsonb,
  p_prereqs       jsonb,
  p_missions      jsonb default '[]'::jsonb,
  p_reason        text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_course_id      uuid;
  v_course_kind    text;
  v_old_xp         integer;
  v_is_owner       boolean;
  v_steps_xp       integer;
  v_count          integer;
  v_request        uuid;
  v_mission_count  integer;
  v_old_missions   integer;
  v_new_missions   integer;
  v_old_total      integer;
  v_new_parent     integer;
begin
  if p_steps is null or jsonb_typeof(p_steps) <> 'array'
     or p_prereqs is null or jsonb_typeof(p_prereqs) <> 'array'
     or p_missions is null or jsonb_typeof(p_missions) <> 'array' then
    raise exception 'steps, prereqs and missions must all be JSON arrays';
  end if;

  -- The parent must be a real syllabus node, not another help step: nesting a
  -- scaffold under a scaffold fragments an already-fragmented reward.
  select n.course_id, n.xp_reward into v_course_id, v_old_xp
  from skill_nodes n
  where n.id = p_node_id and n.parent_node_id is null and n.course_id is not null;
  if v_course_id is null then
    raise exception 'that node is not one help can be added to';
  end if;

  select (c.owner_id = auth.uid()), c.course_kind
    into v_is_owner, v_course_kind
  from courses c where c.id = v_course_id;

  if not coalesce(v_is_owner, false) then
    if v_course_kind = 'official' then
      raise exception 'only the owner of an official course can add help to it'
        using errcode = '42501';
    end if;
    if not exists (select 1 from enrollments e
                   where e.course_id = v_course_id
                     and e.user_id = auth.uid()
                     and e.role = 'student') then
      raise exception 'you are not a student on that course'
        using errcode = '42501';
    end if;
  end if;

  v_count := jsonb_array_length(p_steps);
  if v_count < 2 or v_count > 5 then
    raise exception 'a help subtree is 2 to 5 steps, not %', v_count;
  end if;

  -- Every edge must stay inside this subtree. Without this the caller could
  -- hand over an edge naming any node in any course and this definer function
  -- would happily write it.
  if exists (
    select 1 from jsonb_array_elements(p_prereqs) e
    where not exists (select 1 from jsonb_array_elements(p_steps) s
                      where (s->>'id')::uuid = (e->>'prereq_id')::uuid)
       or ((e->>'node_id')::uuid <> p_node_id
           and not exists (select 1 from jsonb_array_elements(p_steps) s
                           where (s->>'id')::uuid = (e->>'node_id')::uuid))
  ) then
    raise exception 'a help edge must stay inside the subtree';
  end if;

  select coalesce(sum((s->>'xp_reward')::integer), 0) into v_steps_xp
  from jsonb_array_elements(p_steps) s;

  select count(*)::integer into v_mission_count from missions m where m.node_id = p_node_id;

  -- Same reason the edges are checked above: without this, a caller could
  -- re-price any mission in any course through this definer function.
  if exists (
    select 1 from jsonb_array_elements(p_missions) x
    where not exists (
      select 1 from missions m where m.id = (x->>'id')::uuid and m.node_id = p_node_id
    )
  ) then
    raise exception 'a re-priced mission must belong to the node being scaffolded';
  end if;

  if v_mission_count > 0 then
    -- Partial re-pricing would silently leave some missions at the old price,
    -- which is the same faucet in a smaller form.
    if jsonb_array_length(p_missions) <> v_mission_count then
      raise exception 'all % missions on that node must be re-priced, got %',
        v_mission_count, jsonb_array_length(p_missions);
    end if;

    select coalesce(sum(m.xp_reward), 0) into v_old_missions
    from missions m where m.node_id = p_node_id;

    select coalesce(sum((x->>'xp_reward')::integer), 0) into v_new_missions
    from jsonb_array_elements(p_missions) x;

    if exists (select 1 from jsonb_array_elements(p_missions) x
               where (x->>'xp_reward')::integer < 0) then
      raise exception 'a mission cannot be worth less than nothing';
    end if;

    v_old_total  := v_old_missions;
    v_new_parent := v_new_missions;

    -- The column is a cache of the mission sum. Letting the two drift is what
    -- makes the chart and the record report different totals for one node.
    if p_parent_reward is null or p_parent_reward <> v_new_missions then
      raise exception 'xp_reward must equal what the missions are worth (% <> %)',
        p_parent_reward, v_new_missions;
    end if;
  else
    if jsonb_array_length(p_missions) > 0 then
      raise exception 'that node has no missions to re-price';
    end if;
    v_old_total  := v_old_xp;
    v_new_parent := p_parent_reward;
  end if;

  -- The conservation invariant from src/features/skilltree/missions.ts,
  -- asserted in the database. The null arm matters: without it a missing
  -- p_parent_reward makes the comparison null, and a null `if` is a silently
  -- passed check.
  if v_new_parent is null or v_new_parent + v_steps_xp <> v_old_total then
    raise exception 'help redistributes XP, it never mints it (% + % <> %)',
      v_new_parent, v_steps_xp, v_old_total;
  end if;

  insert into skill_nodes (id, course_id, title, description, kind, xp_reward,
                           x, y, sort_order, parent_node_id, graded)
  select (s->>'id')::uuid, v_course_id, s->>'title', s->>'description',
         (s->>'kind')::node_kind, (s->>'xp_reward')::integer,
         (s->>'x')::double precision, (s->>'y')::double precision,
         (s->>'sort_order')::integer, p_node_id, false
  from jsonb_array_elements(p_steps) s;

  -- course_id is filled in by the node_prereqs_sync_course trigger from 0001.
  insert into node_prereqs (node_id, prereq_id)
  select (e->>'node_id')::uuid, (e->>'prereq_id')::uuid
  from jsonb_array_elements(p_prereqs) e;

  update missions m
  set xp_reward = (x->>'xp_reward')::integer
  from jsonb_array_elements(p_missions) x
  where m.id = (x->>'id')::uuid;

  update skill_nodes set xp_reward = v_new_parent where id = p_node_id;

  insert into help_requests (course_id, node_id, requested_by, requester, reason)
  values (v_course_id, p_node_id, auth.uid(),
          -- Derived here, never taken from the request body: a student cannot
          -- log their request as though the instructor made it.
          case when v_is_owner then 'instructor' else 'student' end,
          nullif(btrim(coalesce(p_reason, '')), ''))
  returning id into v_request;

  return v_request;
end;
$$;

-- ------------------------------------------ 0030: who counts as a colleague

-- 0030 promises, in its own WHAT STAYS SHUT, that "an instructor's email is not
-- disclosed to another instructor". Its fallback enforced that by reading
-- `raw_user_meta_data ->> 'role'` — the tab an account picked at sign-up, which
-- the account itself supplies and which nothing keeps in step with what that
-- account later became.
--
-- Observed: a verified instructor called `course_roster` on a course of their
-- own with no enrolments and received the administrator's email address, and
-- another course owner's. Neither account carries the metadata, because neither
-- was created through the instructor sign-up tab, and both are colleagues by
-- every test this schema actually keeps.
--
-- `is_verified_instructor` and `is_administrator` are those tests. The first
-- reads `revoked_at` since 0028, so an account whose badge was taken away
-- correctly falls back to being listed as a learner.
--
-- The fallback itself is left exactly as 0030 documented it, including the
-- widening it names in capitals and the condition it gives for deleting it.
-- What changes is only which accounts it treats as staff.
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
  if v_caller is null then
    raise exception 'Sign in as the owner of this course to open its roster.'
      using errcode = '42501';
  end if;

  -- Written out rather than calling owns_course, which 0028 redefined to mean
  -- "owner or administrator" on behalf of five migrations' worth of callers.
  -- This read is personal data and states its own gate.
  if not (
    exists (
      select 1 from public.courses c
      where c.id = p_course_id and c.owner_id = v_caller
    )
    or public.is_administrator(v_caller)
  ) then
    raise exception 'You can only open the roster for a course you own.'
      using errcode = '42501';
  end if;

  select exists (
    select 1 from public.enrollments e
    where e.course_id = p_course_id and e.role = 'student'
  ) into v_any_enrolled;

  -- The fallback below lists learner accounts that are NOT on this course, so
  -- its gate cannot be course ownership. 0027 makes creating a course
  -- self-service — `create policy "create own courses" ... with check (owner_id
  -- = auth.uid())` — so "the owner of a course" is a description of anyone who
  -- signed up and inserted one row. Owner-gating a system-wide directory of
  -- names and addresses is therefore no gate at all: register, create a course,
  -- enrol nobody, read every learner's email, forever.
  --
  -- So the fallback additionally requires a verified instructor or an
  -- administrator. That is not a strong boundary and this comment will not
  -- pretend otherwise: 0028 verifies anyone who registers as an instructor, so
  -- the cost of reaching this list is choosing the instructor tab at sign-up.
  -- It is the boundary this product already accepted when it opened the
  -- official catalog on the same signal, and an administrator can revoke it.
  -- The enrolled path above stays owner-or-administrator and is unaffected.
  --
  -- To close it properly, delete the fallback and ship the enrolment write, or
  -- narrow this to `public.is_administrator(v_caller)` alone — one line, and
  -- the roster then shows addresses only to an administrator until enrolment
  -- exists.
  if not v_any_enrolled
    and not (public.is_verified_instructor(v_caller) or public.is_administrator(v_caller))
  then
    raise exception 'Only a verified instructor can see learner accounts that are not enrolled on this course.'
      using errcode = '42501';
  end if;

  return query
    select
      u.id,
      -- The same allowance 0005 makes: a missing or blank profile is not a
      -- reason to fail a roster, and the address below identifies the person
      -- regardless.
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
          -- The fallback. Learner accounts only: a colleague is not a student
          -- and is not listed. Staff is what this schema records about an
          -- account — a live badge, or an administrator row — and not what the
          -- account said about itself at sign-up. An account with neither is
          -- treated as a learner, which is what 0020 and 0028 both assume of
          -- unlabelled accounts.
          not (public.is_verified_instructor(u.id) or public.is_administrator(u.id))
      end
    order by 2, 3;
end;
$$;

comment on function public.course_roster(uuid) is
  'Name and email for one course''s students, to its owner or an administrator. Rows with enrolled = false are registered accounts listed because nobody is enrolled on the course yet.';

-- --------------------------------------- 0037: an ownership change, recorded

-- 0037's trigger logs a publication move and, from an administrator, a retitle.
-- It does not log the column that decides who may do either of those things
-- from then on.
--
-- Observed: an administrator ran `update courses set owner_id = <self>` on
-- another instructor's course. It succeeded under 0028's "administrators update
-- any course" policy; the original instructor lost every read and write they
-- had over their own course, because `read own courses`, the authoring
-- policies, `course_roster` and `course_student_progress` all key on
-- `owner_id`; and the audit log held nothing at all. That is the class of act
-- 0036 was written to surface.
--
-- THE HAT, RE-JUDGED
--   `actor_role` was taken from `new.owner_id` on an UPDATE. On the one
--   statement where that column moves, the administrator doing the taking is
--   the new owner, so the row would have filed the seizure — and any retitle in
--   the same statement — as an owner's own housekeeping. The hat now comes from
--   `old.owner_id`: who held the course when the statement began. For every
--   other update the two are the same value and nothing changes.
--
-- The old owner's name is denormalised into `detail` for the reason 0036 gives
-- for `actor_name`: that account may be erased later, and a row that reads
-- "taken from somebody" is not an audit row.
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
    'administrator.revoked'
  ));

create or replace function public.audit_course_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_role  text;
begin
  -- Migrations, seeds and service-role maintenance carry no end-user context.
  -- Same guard and same reason as `enforce_course_distribution_authority`
  -- (0028): without it, `db reset` writes rows attributed to an administrator
  -- who was never there.
  if auth.uid() is null then
    return null;
  end if;

  -- OLD is unassigned in an INSERT trigger and NEW in a DELETE, so both are
  -- read behind the branch rather than coalesced together. On an UPDATE the hat
  -- is whoever owned the course before the statement ran — see the header:
  -- reading it from NEW lets an administrator file their own seizure as
  -- ownership, along with anything else that moved in the same statement.
  if tg_op = 'INSERT' then
    v_owner := new.owner_id;
  else
    v_owner := old.owner_id;
  end if;
  v_role := case when v_owner = auth.uid() then 'owner' else 'administrator' end;

  if tg_op = 'INSERT' then
    perform public.write_admin_audit(
      'course.created', null, new.id,
      jsonb_build_object('kind', new.course_kind), v_role);
    return null;
  end if;

  if tg_op = 'DELETE' then
    -- No `subject_course_id`: the row it would point at is already gone and the
    -- foreign key refuses it. The title rides in `detail` instead.
    perform public.write_admin_audit(
      'course.deleted', null, null,
      jsonb_build_object('title', old.title, 'kind', old.course_kind), v_role);
    return null;
  end if;

  -- The subject is the account that now holds the course, so the row reads as
  -- who it went to. Who it came from is in `detail`, by id and by the name that
  -- account had on the day.
  if old.owner_id is distinct from new.owner_id then
    perform public.write_admin_audit(
      'course.owner_changed', new.owner_id, new.id,
      jsonb_build_object(
        'was', old.owner_id,
        'was_name', coalesce(
          nullif((select p.display_name from public.profiles p
                   where p.id = old.owner_id), ''),
          (select u.email from auth.users u where u.id = old.owner_id))),
      v_role);
  end if;

  -- Both of the following can be true of one statement. Two changes, two rows;
  -- a single row would have to pick one of them to describe.
  if old.publication_status is distinct from new.publication_status then
    perform public.write_admin_audit(
      case new.publication_status
        when 'published' then 'course.published'
        when 'archived'  then 'course.archived'
        else 'course.unpublished'
      end,
      null, new.id,
      jsonb_build_object('was', old.publication_status),
      v_role);
  end if;

  -- An owner retitling their own course is housekeeping. An administrator
  -- retitling somebody else's is the surprise a reader is here to find, and
  -- 0028's "administrators update any course" policy is the plain UPDATE path
  -- that lets them. Upgrade path, if owner renames turn out to be wanted: drop
  -- the second half of this condition.
  if old.title is distinct from new.title and v_role = 'administrator' then
    perform public.write_admin_audit(
      'course.renamed', null, new.id,
      jsonb_build_object('was', old.title), v_role);
  end if;

  return null;
end;
$$;

-- ------------------------------------- 0033: a revoked badge is not a badge

-- 0033's exclusion asks whether a row exists in `verified_instructors`. When it
-- was written, revoking a badge deleted that row. 0028 changed revocation into
-- a stamp that keeps the row on purpose — deleting it would let the sign-up
-- trigger hand the badge straight back on the next account creation — and this
-- clause did not move with it.
--
-- Observed: a student whose badge was granted and then revoked disappeared from
-- `course_ladder_participants` and from `student_leaderboard`, including their
-- own row, which the `e.user_id = auth.uid()` branch exists specifically to
-- keep. Deleting the revoked row brought them back. Revocation is permanent, so
-- without this that student never sees their own rank again.
--
-- `is_verified_instructor` is the predicate 0028 wrote for this exact question
-- and it reads `revoked_at`. Everything else here is 0033's, unchanged.
create or replace function public.course_ladder_participants(p_course_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select e.user_id
  from public.enrollments e
  join public.courses c on c.id = e.course_id
  left join public.profiles p on p.id = e.user_id
  where c.id = p_course_id
    and e.role = 'student'
    and e.user_id <> c.owner_id
    and (
      coalesce(p.social_opt_in, false)
      or (
        e.user_id = auth.uid()
        and not public.is_verified_instructor(e.user_id)
      )
    )
  union
  select c.owner_id
  from public.courses c
  join public.profiles owner_profile on owner_profile.id = c.owner_id
  where c.id = p_course_id
    and c.course_kind = 'community'
    and c.owner_id = auth.uid()
    and coalesce(owner_profile.social_opt_in, false);
$$;

-- -------------------------------------------------------------------- grants

-- The doors 0023 and 0033 believed they had shut. Every function on this first
-- list was revoked from PUBLIC by the migration that created it and granted to
-- nobody afterwards, which is a statement of intent that Supabase's own grants
-- to `anon` and `authenticated` quietly overrode. None is named by any client,
-- and none is called from an RLS policy — a policy expression runs as the
-- querying role and would need the grant. Their callers are security definer
-- functions and triggers, whose callees are checked against the definer, so
-- `student_leaderboard` and the two progress triggers work exactly as before.
--
-- Observed on the two 0033 describes as internal: an account that could not
-- read a course at all — `select count(*) from courses` returned zero — read a
-- real learner off `course_ladder_participants` for that course, and used
-- `can_view_course_ladder` as an oracle for whether a named person was enrolled
-- on it. And on 0023's: an account with no `node_progress` of its own asked
-- `node_prerequisites_mastered(<another student>, <node>)` and was told what
-- that student had cleared.
revoke all on function public.can_view_course_ladder(uuid, uuid)      from public, anon, authenticated;
revoke all on function public.course_ladder_participants(uuid)        from public, anon, authenticated;
revoke all on function public.node_prerequisites_mastered(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_record_course_progress(uuid, uuid)  from public, anon, authenticated;

-- Trigger functions. A client calling one of these directly is told it can only
-- be called as a trigger, so this closes an oddity rather than a hole — but it
-- makes "no trigger function is reachable from a client" a rule of this schema
-- instead of a property of whichever ones happened to be revoked. Firing a
-- trigger does not check EXECUTE against the statement's role, so every trigger
-- below goes on firing for everyone.
revoke all on function public.audit_course_change()                   from public, anon, authenticated;
revoke all on function public.audit_enrollment_change()               from public, anon, authenticated;
revoke all on function public.enforce_course_distribution_authority() from public, anon, authenticated;
revoke all on function public.enroll_student_course_owner()           from public, anon, authenticated;
revoke all on function public.handle_new_user_profile()               from public, anon, authenticated;
revoke all on function public.protect_mission_progress_award()        from public, anon, authenticated;
revoke all on function public.protect_node_progress_award()           from public, anon, authenticated;
revoke all on function public.sync_mission_course()                   from public, anon, authenticated;
revoke all on function public.sync_prereq_course()                    from public, anon, authenticated;
revoke all on function public.verify_instructor_on_signup()           from public, anon, authenticated;

-- Replacing a function preserves its grants, so the two rewritten above keep
-- what 0004 and 0030 gave them. Restated rather than assumed.
revoke all on function public.course_roster(uuid) from public, anon;
grant execute on function public.course_roster(uuid) to authenticated;

revoke all on function public.request_help_subtree(uuid, integer, jsonb, jsonb, jsonb, text)
  from public, anon;
grant execute on function public.request_help_subtree(uuid, integer, jsonb, jsonb, jsonb, text)
  to authenticated;
