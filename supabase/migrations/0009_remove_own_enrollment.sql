create policy "remove own enrollment" on public.enrollments
  for delete using (user_id = auth.uid());
