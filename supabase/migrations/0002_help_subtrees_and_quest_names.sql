-- Help subtrees, generated quest names, and the extra-help audit trail.
--
-- The security model is unchanged from 0001_init.sql: deny by default, RLS is
-- the access control, and an instructor never reads a named student's record.
-- Two things are new. Writes to skill_nodes open up to the course owner only,
-- so a student cannot retitle or re-price the tree they are graded on. And a
-- help subtree is inserted through one security-definer function rather than a
-- student-facing insert policy, because the XP split has to be atomic and a
-- student must never be able to write a graded node.

-- ------------------------------------------------- help nodes on skill_nodes

alter table skill_nodes
  -- The syllabus node this step was generated to scaffold. Null on every node
  -- that came from the syllabus itself.
  add column parent_node_id uuid references skill_nodes on delete cascade,
  -- False on a supplemental help node. Asking for help must not change what a
  -- course is worth, so anything that computes a grade filters on this rather
  -- than inferring it from parent_node_id.
  add column graded boolean not null default true;

-- The grade boundary, enforced by the database rather than by whichever client
-- writes the row: a node that scaffolds another node can never count.
alter table skill_nodes
  add constraint help_nodes_are_ungraded
  check (parent_node_id is null or graded = false);

create index skill_nodes_parent_idx on skill_nodes (parent_node_id);

-- ----------------------------------------------- quest and achievement names
--
-- ponytail: five nullable columns on skill_nodes, not a names table. A quest
-- name is 1:1 with its node, and so is the achievement for finishing it —
-- `Achievement` in frontend/lib/cardinal-domain.ts is id + title + description
-- + unlockedAt + rarity, and the first four are the node id, the two columns
-- below, and node_progress.completed_at. A table would buy a join and a second
-- RLS surface to store one row per node. Split it out if an achievement ever
-- needs to exist without a node, or if rarity stops being derivable.

alter table skill_nodes
  add column quest_title             text,
  add column quest_subtitle          text,
  add column achievement_title       text,
  add column achievement_description text,
  -- A title an instructor typed by hand. `name-quest` skips any node where
  -- this is set, which is the entire reason the column exists.
  add column title_override          text;

-- Reads need no new policy: 0001's "read nodes of enrolled courses" already
-- says a generated name is readable by exactly whoever can read the node.
-- Writes are new, and they are owner-only — a student may not set a name, an
-- override, or an xp_reward. There is deliberately no student-facing write
-- policy on skill_nodes; help steps go through request_help_subtree() below.
-- Nodes on a universal track have a null course_id, so this denies them too:
-- tracks stay staff-authored.
create policy "course owner writes nodes" on skill_nodes
  for update using (
    exists (select 1 from courses c
            where c.id = skill_nodes.course_id and c.owner_id = auth.uid())
  ) with check (
    exists (select 1 from courses c
            where c.id = skill_nodes.course_id and c.owner_id = auth.uid())
  );

-- ---------------------------------------------------- extra-help audit trail

-- One row per "need extra help" request: who asked, on which node, when, and
-- whether they asked as a student or as the instructor. The generated steps
-- themselves hang off skill_nodes.parent_node_id.
create table help_requests (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references courses on delete cascade,
  node_id      uuid not null references skill_nodes on delete cascade,
  requested_by uuid not null references auth.users on delete cascade,
  -- Text + check rather than an enum, matching enrollments.role, which this
  -- mirrors. Values track HelpRequester in src/features/skilltree/types.ts.
  requester    text not null check (requester in ('student', 'instructor')),
  -- What the requester said they were stuck on. Free text, optional.
  reason       text,
  created_at   timestamptz not null default now()
);

create index help_requests_course_idx on help_requests (course_id, node_id);

alter table help_requests enable row level security;

-- A student reads their own requests and nothing else. There is deliberately
-- no instructor select policy: "student X asked for help on the midterm" is a
-- struggle signal attached to a name, which is the thing 0001 keeps out of the
-- instructor view. Writes have no policy at all — the only way a row gets in
-- is request_help_subtree() below, which stamps requested_by from auth.uid().
create policy "read own help requests" on help_requests
  for select using (requested_by = auth.uid());

-- Instructor dashboard: which nodes the cohort is getting stuck on, as a count
-- of distinct students. Same shape and the same suppression floor as
-- course_progress_summary in 0001 — below five students a count identifies a
-- person, so it is not returned at all.
create or replace function help_request_summary(p_course_id uuid)
returns table (node_id uuid, requester_count integer)
language sql stable security definer set search_path = public as $$
  select h.node_id, count(distinct h.requested_by)::integer
  from help_requests h
  where h.course_id = p_course_id
    and exists (
      select 1 from courses c
      where c.id = p_course_id and c.owner_id = auth.uid()
    )
  group by h.node_id
  having count(distinct h.requested_by) >= 5;
$$;

-- --------------------------------------------------- applying a help subtree

-- Insert one generated help subtree and re-price its parent, atomically.
--
-- security definer with its own authorisation check, on purpose. The
-- alternative — a student-facing insert/update policy on skill_nodes — would
-- let any enrolled student rewrite any node in their course, including its
-- xp_reward. Here an enrolled caller can do exactly one thing: hang ungraded
-- steps under a node they can already read, moving XP that already exists.
--
-- The conservation check is the invariant from src/features/skilltree/subtree.ts
-- asserted in the database. It is what fails loudly if the XP split
-- reimplemented in supabase/functions/suggest-subtree/index.ts ever drifts from
-- fragmentXp(): help redistributes XP, it never mints it.
create or replace function request_help_subtree(
  p_node_id       uuid,
  p_parent_reward integer,
  -- [{id,title,description,kind,xp_reward,x,y,sort_order}]
  p_steps         jsonb,
  -- [{node_id,prereq_id}]
  p_prereqs       jsonb,
  p_reason        text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_course_id uuid;
  v_old_xp    integer;
  v_is_owner  boolean;
  v_steps_xp  integer;
  v_count     integer;
  v_request   uuid;
begin
  if p_steps is null or jsonb_typeof(p_steps) <> 'array'
     or p_prereqs is null or jsonb_typeof(p_prereqs) <> 'array' then
    raise exception 'steps and prereqs must both be JSON arrays';
  end if;

  -- The parent must be a real syllabus node, not another help step: nesting a
  -- scaffold under a scaffold fragments an already-fragmented reward.
  select n.course_id, n.xp_reward into v_course_id, v_old_xp
  from skill_nodes n
  where n.id = p_node_id and n.parent_node_id is null and n.course_id is not null;
  if v_course_id is null then
    raise exception 'that node is not one help can be added to';
  end if;

  select (c.owner_id = auth.uid()) into v_is_owner from courses c where c.id = v_course_id;
  if not coalesce(v_is_owner, false)
     and not exists (select 1 from enrollments e
                     where e.course_id = v_course_id and e.user_id = auth.uid()) then
    raise exception 'you are not on that course';
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

  -- The null arm matters: without it a missing p_parent_reward makes the
  -- comparison null, and a null `if` is a silently passed check.
  if p_parent_reward is null or p_parent_reward + v_steps_xp <> v_old_xp then
    raise exception 'help redistributes XP, it never mints it (% + % <> %)',
      p_parent_reward, v_steps_xp, v_old_xp;
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

  update skill_nodes set xp_reward = p_parent_reward where id = p_node_id;

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

-- This one writes, so its reach is spelled out rather than left to the default
-- grant. A signed-out caller has no auth.uid() and would fail the enrolment
-- check anyway; saying so here means that is not the only thing standing
-- between an anonymous request and an insert.
revoke execute on function request_help_subtree(uuid, integer, jsonb, jsonb, text)
  from public, anon;
grant execute on function request_help_subtree(uuid, integer, jsonb, jsonb, text)
  to authenticated;
