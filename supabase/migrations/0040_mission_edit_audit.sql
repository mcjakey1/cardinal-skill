-- A mission edited by somebody who does not own the course.
--
-- 0037 leaves per-mission edits out, and for authoring that is right: the
-- mission editor saves once per pass through a mission, and a term of it would
-- be thousands of rows saying the XP on Mission 3 moved. What that reasoning
-- missed is who else can reach the editor. `update_course_mission` (0027) gates
-- on `owns_course`, and 0028 redefined `owns_course` as `can_administer_course`
-- — administrator or owner. So an administrator can rewrite the title, XP,
-- estimate and difficulty of a mission on somebody else's course, and nothing
-- anywhere records it. That is the case 0036's header exists for.
--
-- `chart.published` does not cover it either. This function keeps the node's
-- `xp_reward` cache in step itself, so a later publish finds no drift to
-- repair, every counter reads zero and 0038's "a publish that changed nothing
-- is not an event" guard suppresses the row. Not recorded coarsely. Not
-- recorded.
--
-- THE GATE IS 0037'S, ONE TABLE OVER. Actor = owner writes nothing, anybody
-- else writes a row. Authoring stays silent; authority over another person's
-- course does not. Same shape as the enrolment trigger's actor = subject test,
-- and the same reason: the noise all comes from the case where the person and
-- the work are the same person's.
--
-- The body is 0027's. The additions are the two columns the select already had
-- to read anyway, the owner lookup, and the block before `end`; a diff against
-- 0027 should show nothing else.

alter table public.admin_audit_log drop constraint admin_audit_log_action_check;

alter table public.admin_audit_log add constraint admin_audit_log_action_check
  check (action in (
    'course.created',
    'course.published',
    'course.unpublished',
    'course.archived',
    'course.renamed',
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

create or replace function public.update_course_mission(
  p_mission_id uuid,
  p_title text,
  p_description text,
  p_xp_reward integer,
  p_estimated_minutes integer,
  p_difficulty text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node_id   uuid;
  v_course_id uuid;
  v_owner     uuid;
  v_was_title text;
  v_was_xp    integer;
begin
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Mission title is required.';
  end if;
  if p_xp_reward is null or p_xp_reward < 10 or p_xp_reward > 100 then
    raise exception 'Mission XP must be between 10 and 100.';
  end if;
  if p_estimated_minutes is null or p_estimated_minutes < 1 or p_estimated_minutes > 600 then
    raise exception 'Estimated time must be between 1 and 600 minutes.';
  end if;
  if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'Difficulty must be easy, medium, or hard.';
  end if;

  -- Read before the update, or the row it describes is already gone.
  select m.node_id, m.course_id, m.title, m.xp_reward
    into v_node_id, v_course_id, v_was_title, v_was_xp
  from public.missions m where m.id = p_mission_id;

  if v_node_id is null or not public.owns_course(v_course_id) then
    raise exception 'Only the course owner can edit this mission.' using errcode = '42501';
  end if;

  perform 1 from public.skill_nodes where id = v_node_id for update;

  update public.missions set
    title = trim(p_title),
    description = trim(coalesce(p_description, '')),
    xp_reward = p_xp_reward,
    estimated_minutes = p_estimated_minutes,
    difficulty = p_difficulty
  where id = p_mission_id;

  update public.skill_nodes set xp_reward = (
    select coalesce(sum(m.xp_reward), 0)::integer
    from public.missions m where m.node_id = v_node_id
  ) where id = v_node_id;

  -- The record. `owner_id` rather than `is_administrator()`, for 0037's reason:
  -- an administrator editing a mission on their own course is authoring, and
  -- filing it as an intrusion would be a lie in the other direction.
  select c.owner_id into v_owner from public.courses c where c.id = v_course_id;

  if v_owner is distinct from auth.uid() then
    perform public.write_admin_audit(
      'mission.edited', null, v_course_id,
      -- `was` is the key `describeAuditAction` already reads for a previous
      -- state, so a retitled mission needs no new sentence on the screen. The
      -- XP pair is not rendered: it is the evidence the row is opened for.
      jsonb_build_object(
        'mission', trim(p_title),
        'was',     v_was_title,
        'xp_was',  v_was_xp,
        'xp',      p_xp_reward),
      'administrator');
  end if;
end;
$$;

revoke all on function public.update_course_mission(uuid, text, text, integer, integer, text)
  from public, anon;
grant execute on function public.update_course_mission(uuid, text, text, integer, integer, text)
  to authenticated;

comment on table public.admin_audit_log is
  'Append-only record of administrator and instructor actions on courses, charts, missions and enrolments. Written only by triggers and the definer functions that perform them; readable by administrators.';
