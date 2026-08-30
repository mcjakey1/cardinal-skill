-- Metadata extracted by the syllabus parser. These fields remain owner-scoped
-- by the existing courses RLS policies.
alter table public.courses
  add column description text not null default '',
  add column units smallint;

alter table public.courses
  add constraint courses_description_length check (char_length(description) <= 1000),
  add constraint courses_units_range check (units is null or units between 0 and 30);

comment on column public.courses.description is
  'Concise catalog description extracted from the uploaded syllabus.';

comment on column public.courses.units is
  'Course unit count extracted from the uploaded syllabus when explicitly stated.';
