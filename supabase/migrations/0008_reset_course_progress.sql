create or replace function public.reset_own_course_progress(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from mission_progress mp
  using missions m
  where mp.mission_id = m.id
    and m.course_id = p_course_id
    and mp.user_id = auth.uid();

  delete from node_progress np
  using skill_nodes n
  where np.node_id = n.id
    and n.course_id = p_course_id
    and np.user_id = auth.uid();

  delete from xp_events
  where course_id = p_course_id
    and user_id = auth.uid();
end;
$$;

revoke all on function public.reset_own_course_progress(uuid) from public;
grant execute on function public.reset_own_course_progress(uuid) to authenticated;
