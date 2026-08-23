-- Complete the course-owner authoring permissions started in 0002.
-- That migration allowed updates only, so both the manual author and syllabus
-- parser were blocked when they tried to create the first node. The ownership
-- check remains in RLS and universal-track content remains read-only.

create policy "course owner inserts nodes" on public.skill_nodes
  for insert
  with check (public.owns_course(course_id));

create policy "course owner deletes nodes" on public.skill_nodes
  for delete
  using (public.owns_course(course_id));

-- sync_prereq_course() fills course_id before the RLS WITH CHECK is evaluated.
-- Both endpoints must belong to the same owned course so a caller cannot join
-- their graph to a node from a different course.
create policy "course owner inserts prereqs" on public.node_prereqs
  for insert
  with check (
    public.owns_course(course_id)
    and public.owns_node_course(node_id)
    and public.owns_node_course(prereq_id)
  );

create policy "course owner deletes prereqs" on public.node_prereqs
  for delete
  using (
    public.owns_course(course_id)
    and public.owns_node_course(node_id)
    and public.owns_node_course(prereq_id)
  );
