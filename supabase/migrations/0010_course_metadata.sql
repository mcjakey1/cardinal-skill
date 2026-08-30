-- Course codes are display metadata owned by the same instructor who owns the
-- course. Existing RLS on courses already gates both reads and writes.
alter table public.courses
  add column course_code text;

alter table public.courses
  add constraint courses_course_code_length check (char_length(course_code) <= 32),
  add constraint courses_title_length check (char_length(title) between 1 and 160),
  add constraint courses_term_length check (term is null or char_length(term) <= 160);

comment on column public.courses.course_code is
  'Short catalogue code shown beside the full course title, for example CPE111.';
