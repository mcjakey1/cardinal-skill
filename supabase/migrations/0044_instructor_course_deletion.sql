-- Course deletion from the instructor workspace.
--
-- 0027 limited deletion to private practice drafts because the student library
-- exposed the action without a complete account-level confirmation. The
-- instructor workspace now makes the cascade explicit and asks twice. The
-- database boundary stays narrower than the workspace's authoring boundary:
-- only the owner may delete, even when the caller is an administrator who may
-- edit or archive somebody else's course.

drop policy if exists "delete own private courses" on public.courses;

create policy "delete own courses"
  on public.courses
  for delete
  using (owner_id = auth.uid());

comment on policy "delete own courses" on public.courses is
  'An instructor may permanently delete only a course they own. Administrators archive, rather than delete, another instructor''s course.';
