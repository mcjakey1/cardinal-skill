-- A student who creates a course is both its content owner and a learner in it.
-- Course visibility already follows owner_id, but progression and leaderboards
-- deliberately follow student enrollments. Keep those two facts synchronized
-- at the database boundary so every client and platform sees the same result.

create or replace function enroll_student_course_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1
    from auth.users u
    where u.id = new.owner_id
      and u.raw_user_meta_data ->> 'role' = 'student'
  ) then
    insert into enrollments (user_id, course_id, role)
    values (new.owner_id, new.id, 'student')
    on conflict (user_id, course_id) do update set role = excluded.role;
  end if;
  return new;
end;
$$;

drop trigger if exists student_course_owner_enrolled on courses;
create trigger student_course_owner_enrolled
  after insert on courses
  for each row execute function enroll_student_course_owner();

revoke all on function enroll_student_course_owner() from public;

-- Repair courses created before the trigger existed. Instructor-owned courses
-- remain instructor-owned and are not placed on the student leaderboard.
insert into enrollments (user_id, course_id, role)
select c.owner_id, c.id, 'student'
from courses c
join auth.users u on u.id = c.owner_id
where u.raw_user_meta_data ->> 'role' = 'student'
on conflict (user_id, course_id) do update set role = excluded.role;
