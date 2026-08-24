-- What a student's skill tree canvas is drawn on, kept with the account so the
-- same chart looks the same on their phone, their tablet, and the web.
--
-- Its own table rather than a column on `profiles`, and that is the whole point
-- of the file: 0005 lets a course owner select the profile row of a student
-- they teach, and RLS is row-level, not column-level. A picture the student
-- chose would ride along with the display name the instructor is entitled to.
-- Nothing in this table is readable by anyone but the student it belongs to.

create table student_preferences (
  user_id         uuid primary key references auth.users on delete cascade,
  -- `{ id, imageUri, dim }` as the app writes it. The shape is validated on
  -- both sides of the wire — `parseBackdrop` in src/theme/backdrops.ts — so the
  -- database only insists this is an object, and a bounded one.
  canvas_backdrop jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),
  constraint canvas_backdrop_is_object
    check (jsonb_typeof(canvas_backdrop) = 'object'),
  -- A picked photo is stored inline, so the row carries real bytes. Four
  -- megabytes is the app's two-megabyte ceiling on the picture with room for
  -- the rest of the object; past that the row is a mistake, not a wallpaper.
  constraint canvas_backdrop_fits
    check (length(canvas_backdrop::text) <= 4194304)
);

alter table student_preferences enable row level security;

create policy "own preferences" on student_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
