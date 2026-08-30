-- What the audit trail records, and what it deliberately does not.
--
--   supabase start
--   npm run db:reset
--   npm run test:db
--
-- Plain psql, no pgTAP, for the same reason `npm test` is bare `node --test`:
-- one more framework to install is one more thing between a failing assertion
-- and the person who has to read it. Each check is a `do` block ending in an
-- `assert`, whose message is the name of the test. A failed assert raises, and
-- `-v ON_ERROR_STOP=1` turns that into a non-zero exit.
--
-- The whole file runs inside one transaction and rolls back, so a run leaves
-- nothing behind and can be repeated without a reset.
--
-- IMPERSONATION
--   `auth.uid()` reads `request.jwt.claims ->> 'sub'`. The first check below
--   asserts exactly that, because every other check in this file rests on it
--   and a silent change to that plumbing would make them all pass while
--   testing nothing. `reset role` between actors; claims set to the empty
--   string is nobody, which is what a migration and the service role look like.
--
-- BOOTSTRAPPING
--   The accounts, the administrator row and the verification row are inserted
--   directly as superuser rather than through the API, because
--   `admin_set_administrator` requires an existing administrator to call it —
--   the first one cannot be made through the API by anybody. That is the same
--   chicken-and-egg an operator hits on a new project, and 0028 says so.
--
--   Fixtures are created with no claims set, so the triggers return early and
--   the fixture writes no rows — with one deliberate exception. 0042 records an
--   `administrators` insert however it was made, precisely because a grant made
--   out of band is the one nobody could see before, so the fixture's own admin
--   row is in the log from the start. Counts below are scoped accordingly.

begin;

-- ------------------------------------------------------------- the plumbing

do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  assert auth.uid() = '11111111-1111-1111-1111-111111111111'::uuid,
    'auth.uid() reads the subject out of request.jwt.claims';
  perform set_config('request.jwt.claims', '', true);
  assert auth.uid() is null,
    'no claims at all is nobody, not an error';
end $$;

-- --------------------------------------------------------------- fixtures

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'admin@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'student@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'other@example.test');

update public.profiles set display_name = 'O. Owner'
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'A. Admin'
  where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set display_name = 'S. Student'
  where id = '33333333-3333-3333-3333-333333333333';

insert into public.administrators (user_id)
  values ('22222222-2222-2222-2222-222222222222')
  on conflict (user_id) do nothing;

-- An official course needs a verified author. The sign-up trigger grants this
-- from user metadata, which these fixtures do not carry, so it is set here.
insert into public.verified_instructors (user_id)
  values ('11111111-1111-1111-1111-111111111111')
  on conflict (user_id) do nothing;

insert into public.courses (id, owner_id, title, course_kind, publication_status, discoverability)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Statistics 101', 'official', 'draft', 'private'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Playground', 'practice', 'draft', 'private'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Chemistry 201', 'official', 'draft', 'private'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Doomed', 'practice', 'draft', 'private');

do $$
begin
  -- The fixture inserts an `administrators` row directly, which 0042 records:
  -- an authority grant made out of band is the one an auditor most needs to
  -- see, and it used to write nothing at all. So the log is not empty here —
  -- it holds exactly that grant, filed against no signed-in user.
  assert (select count(*) from public.admin_audit_log
          where action <> 'administrator.granted') = 0,
    'a fixture written with no signed-in account records nothing else';

  assert (select count(*) from public.admin_audit_log
          where action = 'administrator.granted'
            and actor_id is null
            and actor_name = 'Direct database access'
            and detail ->> 'out_of_band' = 'true') = 1,
    'an administrator created out of band is recorded as such, not as a person';
end $$;

-- The badge that gates the whole catalog is granted by a trigger on sign-up.
-- 0028 made that open on purpose and 0042 does not change it; what 0042 adds is
-- that it no longer happens silently.
do $$
declare v_rows integer;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at, raw_user_meta_data)
  values ('5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'signup@example.test', 'x', now(), now(), now(), '{"role":"instructor"}'::jsonb);

  select count(*) into v_rows from public.admin_audit_log
  where action = 'instructor.verified'
    and subject_user_id = '5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a'
    and detail ->> 'at_signup' = 'true';
  assert v_rows = 1, 'a badge granted at sign-up says so in the record';

  delete from public.admin_audit_log
   where subject_user_id = '5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a';
  delete from auth.users where id = '5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a';
end $$;

-- ===========================================================================
-- Slice 1 — course changes are logged by a trigger
-- ===========================================================================

-- The owner publishes their own Playground course to Community.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select public.publish_community_course('aaaaaaaa-0000-0000-0000-000000000002');
reset role;

do $$
declare v_row public.admin_audit_log;
begin
  select * into v_row from public.admin_audit_log
   where subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000002';

  assert (select count(*) from public.admin_audit_log
           where subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 1,
    'publishing a course as its owner records one row, as an owner';
  assert v_row.action = 'course.published',
    'publishing a course as its owner records one row, as an owner';
  assert v_row.actor_role = 'owner',
    'publishing a course as its owner records one row, as an owner';
  assert v_row.actor_id = '11111111-1111-1111-1111-111111111111'::uuid,
    'publishing a course as its owner records one row, as an owner';
  assert v_row.actor_name = 'O. Owner',
    'publishing a course as its owner records one row, as an owner';
end $$;

-- An administrator publishes the owner's official draft.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.admin_set_course_publication('aaaaaaaa-0000-0000-0000-000000000001', 'published');
reset role;

do $$
declare v_row public.admin_audit_log;
begin
  select * into v_row from public.admin_audit_log
   where subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000001';

  assert v_row.actor_role = 'administrator',
    'an administrator publishing somebody else''s course records it as an administrator';
  assert v_row.actor_id = '22222222-2222-2222-2222-222222222222'::uuid,
    'an administrator publishing somebody else''s course records it as an administrator';

  -- 0037 takes the `write_admin_audit` call out of `admin_set_course_publication`
  -- and leaves the trigger as the only writer. Two rows here is that removal
  -- having been missed.
  assert (select count(*) from public.admin_audit_log
           where subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1,
    'an administrator publishing a course records it once, not twice';

  assert v_row.detail ->> 'was' = 'draft',
    'a publication change records what the course was before';
  assert v_row.subject_course = 'Statistics 101',
    'a publication change names the course it changed';
end $$;

-- The owner creates a course the way the workspace does: a plain insert.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
insert into public.courses (id, owner_id, title)
values ('aaaaaaaa-0000-0000-0000-000000000005',
        '11111111-1111-1111-1111-111111111111', 'Brand New');
reset role;

do $$
declare v_row public.admin_audit_log;
begin
  select * into v_row from public.admin_audit_log
   where subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000005';

  assert v_row.action = 'course.created',
    'creating a course records who created it';
  assert v_row.actor_id = '11111111-1111-1111-1111-111111111111'::uuid,
    'creating a course records who created it';
  assert v_row.actor_role = 'owner',
    'creating a course records who created it';
  assert v_row.subject_course = 'Brand New',
    'creating a course records who created it';
end $$;

-- The owner deletes their own practice draft, which is the only delete RLS
-- allows anybody.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
delete from public.courses where id = 'aaaaaaaa-0000-0000-0000-000000000004';
reset role;

do $$
declare v_row public.admin_audit_log;
begin
  select * into v_row from public.admin_audit_log where action = 'course.deleted';

  -- The foreign key would refuse the id of a course that no longer exists, so
  -- the title has to survive in `detail` and be read back out into the name
  -- column. Getting this wrong leaves the row reading "a deleted course".
  assert v_row.subject_course_id is null,
    'deleting a course records the title it had';
  assert v_row.detail ->> 'title' = 'Doomed',
    'deleting a course records the title it had';
  assert v_row.subject_course = 'Doomed',
    'deleting a course records the title it had';
end $$;

-- The owner retitles their own course.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
update public.courses set title = 'Chemistry 201 (Fall)'
  where id = 'aaaaaaaa-0000-0000-0000-000000000003';
reset role;

do $$
begin
  assert (select count(*) from public.admin_audit_log where action = 'course.renamed') = 0,
    'an owner renaming their own course records nothing';
end $$;

-- An administrator retitles somebody else's. 0028's "administrators update any
-- course" policy is the plain UPDATE path that lets them, so this is a real
-- rename by a non-owner and not a statement that matches no rows.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
update public.courses set title = 'Chem 201'
  where id = 'aaaaaaaa-0000-0000-0000-000000000003';
reset role;

do $$
declare v_row public.admin_audit_log;
begin
  select * into v_row from public.admin_audit_log where action = 'course.renamed';

  -- If this comes back 0, the administrator's UPDATE matched nothing and the
  -- policy assumption above is wrong. If it comes back 2, the owner's rename
  -- was recorded too and the role guard is missing.
  assert (select count(*) from public.admin_audit_log where action = 'course.renamed') = 1,
    'an administrator renaming somebody else''s course records the old title';
  assert v_row.detail ->> 'was' = 'Chemistry 201 (Fall)',
    'an administrator renaming somebody else''s course records the old title';
  assert v_row.actor_role = 'administrator',
    'an administrator renaming somebody else''s course records the old title';
end $$;

-- A change to something the log has no opinion about.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
update public.courses set term = 'Fall 2026'
  where id = 'aaaaaaaa-0000-0000-0000-000000000005';
reset role;

do $$
begin
  assert (select count(*) from public.admin_audit_log
           where subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000005') = 1,
    'a course update that changed neither status nor title records nothing';
end $$;

-- Nobody signed in: a migration, a seed, or server maintenance.
select set_config('request.jwt.claims', '', true);
update public.courses set title = 'Renamed By Nobody'
  where id = 'aaaaaaaa-0000-0000-0000-000000000005';

do $$
begin
  assert (select count(*) from public.admin_audit_log
           where subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000005') = 1,
    'a migration with no signed-in account records nothing';
end $$;

-- ------------------------------------------------------------- append only

-- Under RLS an UPDATE or DELETE with no policy matches no rows rather than
-- raising, so these assert on the count affected. An INSERT with no policy does
-- raise, so that one is caught.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_n integer;
begin
  update public.admin_audit_log set action = 'course.archived';
  get diagnostics v_n = row_count;
  assert v_n = 0, 'an administrator cannot update a row in the log';

  delete from public.admin_audit_log;
  get diagnostics v_n = row_count;
  assert v_n = 0, 'an administrator cannot delete a row from the log';
end $$;

do $$
declare v_refused boolean := false;
begin
  begin
    insert into public.admin_audit_log (actor_name, action)
    values ('A. Admin', 'course.published');
  exception when insufficient_privilege then
    v_refused := true;
  end;
  assert v_refused, 'no client role can insert a row into the log';
end $$;

reset role;

-- ===========================================================================
-- Slice 2 — enrolment changes are logged, self-service is not
-- ===========================================================================

select set_config('request.jwt.claims', '', true);
insert into public.courses (id, owner_id, title, course_kind, publication_status, discoverability)
values ('aaaaaaaa-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
        'Cascade Fodder', 'practice', 'draft', 'private');

-- An administrator puts a student on somebody else's course.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.admin_set_enrollment(
  'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', true);
reset role;

do $$
declare v_row public.admin_audit_log;
begin
  select * into v_row from public.admin_audit_log
   where action = 'enrollment.added'
     and subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000001';

  assert v_row.actor_id = '22222222-2222-2222-2222-222222222222'::uuid,
    'an administrator adding a student records who added them';
  assert v_row.actor_role = 'administrator',
    'an administrator adding a student records who added them';
  assert v_row.subject_user_id = '33333333-3333-3333-3333-333333333333'::uuid,
    'an administrator adding a student records who added them';
  assert v_row.subject_name = 'S. Student',
    'an administrator adding a student records who added them';
  assert v_row.detail ->> 'role' = 'student',
    'an administrator adding a student records who added them';

  assert (select count(*) from public.admin_audit_log
           where action = 'enrollment.added'
             and subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1,
    'an administrator adding a student records it once, not twice';
end $$;

-- The same call again, with the role it already has.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.admin_set_enrollment(
  'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', true, 'student');
reset role;

do $$
begin
  -- The upsert fires an UPDATE whether or not the role moved. Without the
  -- `is distinct from` guard in the trigger, every re-add writes a role change.
  assert (select count(*) from public.admin_audit_log
           where action = 'enrollment.role_changed') = 0,
    'an upsert that leaves the role alone records nothing';
end $$;

-- And again, promoting them.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.admin_set_enrollment(
  'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', true, 'instructor');
reset role;

do $$
declare v_row public.admin_audit_log;
begin
  select * into v_row from public.admin_audit_log where action = 'enrollment.role_changed';

  assert (select count(*) from public.admin_audit_log
           where action = 'enrollment.role_changed') = 1,
    'changing somebody''s role on a course records what it was and what it is';
  assert v_row.detail ->> 'from' = 'student',
    'changing somebody''s role on a course records what it was and what it is';
  assert v_row.detail ->> 'to' = 'instructor',
    'changing somebody''s role on a course records what it was and what it is';
end $$;

-- Taken off again, so the two "records nothing" checks below are not measuring
-- a mechanism that never fires in this file at all.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.admin_set_enrollment(
  'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', false);
reset role;

do $$
begin
  assert (select count(*) from public.admin_audit_log
           where action = 'enrollment.removed'
             and subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1,
    'an administrator taking a student off a course records the removal';
end $$;

-- The student joins the owner's published Community course by themselves.
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select public.join_published_course('aaaaaaaa-0000-0000-0000-000000000002');
reset role;

do $$
begin
  assert (select count(*) from public.admin_audit_log
           where action = 'enrollment.added'
             and subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 0,
    'a student joining a published course records nothing';
end $$;

-- And leaves it again, through 0009's own-enrolment policy.
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
delete from public.enrollments
 where course_id = 'aaaaaaaa-0000-0000-0000-000000000002'
   and user_id = '33333333-3333-3333-3333-333333333333';
reset role;

do $$
begin
  assert (select count(*) from public.admin_audit_log
           where action = 'enrollment.removed'
             and subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 0,
    'a student removing their own enrolment records nothing';
end $$;

-- The owner publishes their official course, which enrols them on it as its
-- instructor. Actor and subject are the same account.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select public.publish_official_course('aaaaaaaa-0000-0000-0000-000000000003');
reset role;

do $$
begin
  assert (select count(*) from public.admin_audit_log
           where action = 'enrollment.added'
             and subject_user_id = '11111111-1111-1111-1111-111111111111') = 0,
    'publishing an official course does not record the author enrolling themselves';
  assert (select count(*) from public.admin_audit_log
           where action = 'course.published'
             and subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000003') = 1,
    'publishing an official course still records the publication';
end $$;

-- A course with a class on it, deleted by its owner.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.admin_set_enrollment(
  'aaaaaaaa-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', true);
select public.admin_set_enrollment(
  'aaaaaaaa-0000-0000-0000-000000000006', '44444444-4444-4444-4444-444444444444', true);
reset role;

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
delete from public.courses where id = 'aaaaaaaa-0000-0000-0000-000000000006';
reset role;

do $$
begin
  -- `enrollments.course_id` cascades (0001), and a row trigger cannot tell a
  -- cascade from an intention. Without the parent-exists guard this is two
  -- rows saying the owner removed two students they never touched.
  --
  -- Counted over the whole table rather than narrowed to this course, because
  -- `subject_course_id` is `on delete set null` — a filter on it would come
  -- back empty whether or not the rows were written, and pass either way. One
  -- removal has been recorded in this file so far, by the administrator above.
  assert (select count(*) from public.admin_audit_log
           where action = 'enrollment.removed') = 1,
    'deleting a course does not record a removal for every student on it';
  assert (select count(*) from public.admin_audit_log
           where action = 'course.deleted'
             and detail ->> 'title' = 'Cascade Fodder') = 1,
    'deleting a course still records the deletion itself';
end $$;

-- An account erased while an administrator is signed in. Its enrolments
-- cascade the other way.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.admin_set_enrollment(
  'aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', true);
reset role;

delete from auth.users where id = '44444444-4444-4444-4444-444444444444';

do $$
begin
  -- Whole-table count for the same reason as above: `subject_user_id` is also
  -- `on delete set null`, so narrowing to the erased account would pass on an
  -- empty filter rather than on an absent row.
  assert (select count(*) from public.admin_audit_log
           where action = 'enrollment.removed') = 1,
    'erasing an account does not record a removal for every course they were on';
end $$;

-- ===========================================================================
-- Slice 3 — a chart publish is one row
-- ===========================================================================

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select * from public.publish_chart_changes(
  'aaaaaaaa-0000-0000-0000-000000000001',
  jsonb_build_object(
    'insert_nodes', jsonb_build_array(
      jsonb_build_object('id', 'bbbbbbbb-0000-0000-0000-000000000001', 'title', 'Sampling')),
    'update_nodes',    '[]'::jsonb,
    'archive_nodes',   '[]'::jsonb,
    'restore_nodes',   '[]'::jsonb,
    'delete_prereqs',  '[]'::jsonb,
    'insert_prereqs',  '[]'::jsonb,
    'upsert_missions', '[]'::jsonb,
    'delete_missions', '[]'::jsonb));
reset role;

do $$
declare v_row public.admin_audit_log;
begin
  select * into v_row from public.admin_audit_log where action = 'chart.published';

  assert (select count(*) from public.admin_audit_log where action = 'chart.published') = 1,
    'publishing a chart records one row carrying the counts';
  assert v_row.detail ->> 'nodes_inserted' = '1',
    'publishing a chart records one row carrying the counts';
  assert v_row.detail ->> 'missions_upserted' = '0',
    'publishing a chart records one row carrying the counts';
  assert v_row.actor_role = 'owner',
    'publishing a chart records one row carrying the counts';
  assert v_row.subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
    'publishing a chart records one row carrying the counts';
end $$;

-- The same publish again, with nothing in it.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select * from public.publish_chart_changes(
  'aaaaaaaa-0000-0000-0000-000000000001',
  jsonb_build_object(
    'insert_nodes',    '[]'::jsonb,
    'update_nodes',    '[]'::jsonb,
    'archive_nodes',   '[]'::jsonb,
    'restore_nodes',   '[]'::jsonb,
    'delete_prereqs',  '[]'::jsonb,
    'insert_prereqs',  '[]'::jsonb,
    'upsert_missions', '[]'::jsonb,
    'delete_missions', '[]'::jsonb));
reset role;

do $$
begin
  -- The editor sends whatever the canvas holds, so opening a chart and pressing
  -- Publish without touching it is an ordinary thing to do.
  assert (select count(*) from public.admin_audit_log where action = 'chart.published') = 1,
    'publishing a chart that changed nothing records nothing';
end $$;

select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_refused boolean := false;
begin
  begin
    perform public.publish_chart_changes(
      'aaaaaaaa-0000-0000-0000-000000000001',
      jsonb_build_object(
        'insert_nodes', jsonb_build_array(
          jsonb_build_object('id', 'bbbbbbbb-0000-0000-0000-000000000002', 'title', 'Sneaked in')),
        'update_nodes',    '[]'::jsonb,
        'archive_nodes',   '[]'::jsonb,
        'restore_nodes',   '[]'::jsonb,
        'delete_prereqs',  '[]'::jsonb,
        'insert_prereqs',  '[]'::jsonb,
        'upsert_missions', '[]'::jsonb,
        'delete_missions', '[]'::jsonb));
  exception when others then
    v_refused := true;
  end;
  assert v_refused, 'publishing a chart on somebody else''s course is still refused';
end $$;
reset role;

do $$
begin
  assert (select count(*) from public.admin_audit_log where action = 'chart.published') = 1,
    'a refused chart publish records nothing';
end $$;

-- ===========================================================================
-- Slice 5 — the trail can be asked a narrower question
-- ===========================================================================

-- One statement that changes two things about a course. Both rows carry the
-- same `at`, which is what the keyset pair below exists to survive.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
update public.courses
   set title = 'Statistics 101 (retired)',
       publication_status = 'archived',
       discoverability = 'private'
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;

-- Every row in this file was written inside one transaction, so they all share
-- one `now()`. Two of them are stamped by hand here — as superuser, which
-- bypasses RLS; no client role can reach this — so the date range below has
-- something to include and something to exclude.
update public.admin_audit_log set at = '2026-01-15 12:00:00+00'
 where action = 'chart.published';
update public.admin_audit_log set at = '2026-03-20 12:00:00+00'
 where action = 'course.deleted' and detail ->> 'title' = 'Doomed';

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  assert (select count(*) from public.audit_trail()) =
         (select count(*) from public.admin_audit_log),
    'an unfiltered call returns what the old function returned';

  assert (select count(*) from public.audit_trail(
            p_actor => '11111111-1111-1111-1111-111111111111')
          where actor_id <> '11111111-1111-1111-1111-111111111111') = 0,
    'an administrator filtering by actor gets only that actor''s rows';
  assert (select count(*) from public.audit_trail(
            p_actor => '11111111-1111-1111-1111-111111111111')) > 0,
    'an administrator filtering by actor gets only that actor''s rows';

  assert (select count(*) from public.audit_trail(
            p_actions => array['chart.published'])) = 1,
    'an administrator filtering by action gets only those actions';
  assert (select count(*) from public.audit_trail(
            p_actions => array['chart.published', 'course.deleted'])) = 3,
    'an administrator filtering by action gets only those actions';
end $$;

do $$
begin
  -- The stamped chart publish sits at noon on the 15th of January.
  assert (select count(*) from public.audit_trail(
            p_from => '2026-01-15 00:00:00+00', p_to => '2026-01-15 23:59:59.999+00')) = 1,
    'a date range excludes what falls outside it, at both ends';
  assert (select count(*) from public.audit_trail(
            p_from => '2026-01-16 00:00:00+00', p_to => '2026-01-31 23:59:59.999+00')) = 0,
    'a date range excludes what falls outside it, at both ends';
  assert (select count(*) from public.audit_trail(
            p_from => '2026-01-01 00:00:00+00', p_to => '2026-01-14 23:59:59.999+00')) = 0,
    'a date range excludes what falls outside it, at both ends';
  assert (select count(*) from public.audit_trail(
            p_from => '2026-01-01 00:00:00+00', p_to => '2026-03-31 23:59:59.999+00')) = 2,
    'a date range excludes what falls outside it, at both ends';
end $$;

do $$
begin
  assert (select count(*) from public.audit_trail(p_search => 'Statistics')) > 0,
    'a free-text search matches a course title, a subject''s name and an actor''s name';
  assert (select count(*) from public.audit_trail(p_search => 'S. Student')) > 0,
    'a free-text search matches a course title, a subject''s name and an actor''s name';
  assert (select count(*) from public.audit_trail(p_search => 'A. Admin')) > 0,
    'a free-text search matches a course title, a subject''s name and an actor''s name';
  assert (select count(*) from public.audit_trail(p_search => 'no such thing')) = 0,
    'a free-text search that matches nothing says so rather than returning the page';
end $$;

do $$
declare
  v_first  public.admin_audit_log%rowtype;
  v_second public.admin_audit_log%rowtype;
  v_after  bigint;
begin
  select id, at into v_first.id, v_first.at
    from public.audit_trail() limit 1;
  select id into v_second.id
    from public.audit_trail() offset 1 limit 1;

  select id into v_after from public.audit_trail(
    p_before_at => v_first.at, p_before_id => v_first.id) limit 1;

  assert v_after = v_second.id,
    'a cursor returns the rows after it and never repeats one';
  assert (select count(*) from public.audit_trail(
            p_before_at => v_first.at, p_before_id => v_first.id)
          where id = v_first.id) = 0,
    'a cursor returns the rows after it and never repeats one';
end $$;

do $$
declare v_same integer;
begin
  -- The archive and the retitle above landed in one statement, so they share a
  -- timestamp to the microsecond. A cursor on `at` alone would step over one of
  -- them; ordering on the pair keeps both, newest id first.
  select count(*) into v_same
    from public.audit_trail()
   where action in ('course.archived', 'course.renamed')
     and subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_same = 2,
    'two rows written in one transaction are both returned, in a stable order';

  assert (select count(*) from (
            select id, at, row_number() over (order by at desc, id desc) as seen
              from public.audit_trail()) t
          where t.seen = 1) = 1,
    'two rows written in one transaction are both returned, in a stable order';
end $$;

reset role;

-- An instructor, and a student. Neither is on the administrators table.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_refused boolean := false;
begin
  begin
    perform * from public.audit_trail();
  exception when insufficient_privilege then
    v_refused := true;
  end;
  assert v_refused, 'an instructor asking for the trail is refused';
end $$;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_refused boolean := false;
begin
  begin
    perform * from public.audit_trail();
  exception when insufficient_privilege then
    v_refused := true;
  end;
  assert v_refused, 'a student asking for the trail is refused';
end $$;
reset role;

-- Last, because it buries everything above it. Written as superuser, which is
-- the only writer that can put a row in this table by hand.
select set_config('request.jwt.claims', '', true);
insert into public.admin_audit_log (actor_name, actor_role, action)
select 'Bulk', 'owner', 'course.created' from generate_series(1, 600);

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.audit_trail(p_limit => 100000)) = 500,
    'the limit is clamped so a client cannot ask for the whole table';
  assert (select count(*) from public.audit_trail(p_limit => 0)) = 1,
    'the limit is clamped so a client cannot ask for the whole table';
  assert (select count(*) from public.audit_trail(p_limit => null)) = 100,
    'the limit is clamped so a client cannot ask for the whole table';
end $$;
reset role;

-- ===========================================================================
-- Slice 6 — a mission edit, and the drift a publish repairs
-- ===========================================================================

-- One mission on the node slice 3 created, through the ordinary path.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select * from public.publish_chart_changes(
  'aaaaaaaa-0000-0000-0000-000000000001',
  jsonb_build_object(
    'insert_nodes',    '[]'::jsonb,
    'update_nodes',    '[]'::jsonb,
    'archive_nodes',   '[]'::jsonb,
    'restore_nodes',   '[]'::jsonb,
    'delete_prereqs',  '[]'::jsonb,
    'insert_prereqs',  '[]'::jsonb,
    'upsert_missions', jsonb_build_array(jsonb_build_object(
      'id',        'cccccccc-0000-0000-0000-000000000001',
      'node_id',   'bbbbbbbb-0000-0000-0000-000000000001',
      'title',     'Sampling frames',
      'xp_reward', 40)),
    'delete_missions', '[]'::jsonb));

-- The owner edits their own mission. That is authoring.
select public.update_course_mission(
  'cccccccc-0000-0000-0000-000000000001', 'Sampling frames', '', 40, 30, 'easy');
reset role;

do $$
begin
  assert (select count(*) from public.admin_audit_log where action = 'mission.edited') = 0,
    'an owner editing their own mission records nothing';
end $$;

-- An administrator edits somebody else's. That is not.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.update_course_mission(
  'cccccccc-0000-0000-0000-000000000001', 'Sampling frames II', '', 90, 30, 'hard');
reset role;

do $$
declare v_row public.admin_audit_log;
begin
  select * into v_row from public.admin_audit_log where action = 'mission.edited';

  assert (select count(*) from public.admin_audit_log where action = 'mission.edited') = 1,
    'an administrator editing somebody else''s mission records what moved';
  assert v_row.actor_role = 'administrator',
    'an administrator editing somebody else''s mission records what moved';
  assert v_row.subject_course_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
    'an administrator editing somebody else''s mission records what moved';
  assert v_row.detail ->> 'was' = 'Sampling frames',
    'an administrator editing somebody else''s mission records what moved';
  assert v_row.detail ->> 'xp_was' = '40',
    'an administrator editing somebody else''s mission records what moved';
  assert v_row.detail ->> 'xp' = '90',
    'an administrator editing somebody else''s mission records what moved';
end $$;

-- That edit left the node's XP cache in step, so a publish behind it has
-- nothing to repair and nothing to say. This is the hole `mission.edited`
-- fills, asserted here so neither side can quietly reopen it.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select * from public.publish_chart_changes(
  'aaaaaaaa-0000-0000-0000-000000000001',
  jsonb_build_object(
    'insert_nodes',    '[]'::jsonb,
    'update_nodes',    '[]'::jsonb,
    'archive_nodes',   '[]'::jsonb,
    'restore_nodes',   '[]'::jsonb,
    'delete_prereqs',  '[]'::jsonb,
    'insert_prereqs',  '[]'::jsonb,
    'upsert_missions', '[]'::jsonb,
    'delete_missions', '[]'::jsonb));
reset role;

do $$
begin
  assert (select count(*) from public.admin_audit_log where action = 'chart.published') = 2,
    'an empty publish after a mission edit is still not an event';
end $$;

-- XP drift from outside the publish path, written the way a service-role
-- maintenance script would write it: no claims, so nothing else logs.
update public.skill_nodes set xp_reward = 5
  where id = 'bbbbbbbb-0000-0000-0000-000000000001';

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select * from public.publish_chart_changes(
  'aaaaaaaa-0000-0000-0000-000000000001',
  jsonb_build_object(
    'insert_nodes',    '[]'::jsonb,
    'update_nodes',    '[]'::jsonb,
    'archive_nodes',   '[]'::jsonb,
    'restore_nodes',   '[]'::jsonb,
    'delete_prereqs',  '[]'::jsonb,
    'insert_prereqs',  '[]'::jsonb,
    'upsert_missions', '[]'::jsonb,
    'delete_missions', '[]'::jsonb));
reset role;

do $$
declare v_row public.admin_audit_log;
begin
  select * into v_row from public.admin_audit_log
   where action = 'chart.published' order by at desc limit 1;

  -- An empty batch, but the XP a student sees went from 5 back to 90. All eight
  -- counters read zero, and before 0038 counted step 10 this was "nothing".
  assert (select count(*) from public.admin_audit_log where action = 'chart.published') = 3,
    'a publish whose only effect is repairing XP is an event';
  assert v_row.detail ->> 'xp_repaired' = '1',
    'a publish whose only effect is repairing XP is an event';
  assert v_row.detail ->> 'nodes_updated' = '0',
    'a publish whose only effect is repairing XP is an event';
end $$;

-- ------------------------------------------- 0041: seven authority gaps

-- 0041 closed seven ways an account reached past the authority it was given.
-- Six of the seven are refusals, and a refusal is the one thing a schema can
-- lose without anybody noticing, so each is asserted from the side that used to
-- succeed. Where the fix could plausibly have closed too much — an owner
-- deleting their own node, a student with no badge on their own ladder — the
-- permitted case is asserted next to the refused one under the same name.

-- Fixtures of its own. The accounts at the top of this file have been enrolled,
-- published, retitled and audited by every check between there and here, so a
-- fresh set is what keeps these counts starting from zero. Claims cleared
-- first, for the reason the header gives: a fixture must write no audit rows.
select set_config('request.jwt.claims', '', true);

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'author@example.test'),
  ('66666666-6666-6666-6666-666666666666', 'joiner@example.test'),
  ('77777777-7777-7777-7777-777777777777', 'quiet@example.test');

update public.profiles set display_name = 'E. Author'
  where id = '55555555-5555-5555-5555-555555555555';
-- Opted out of peer visibility, so this account reaches its own ladder only
-- through the `e.user_id = auth.uid()` branch — the one the revoked badge broke.
update public.profiles set display_name = 'Q. Quiet', social_opt_in = false
  where id = '77777777-7777-7777-7777-777777777777';

insert into public.verified_instructors (user_id)
  values ('55555555-5555-5555-5555-555555555555')
  on conflict (user_id) do nothing;

insert into public.courses (id, owner_id, title, course_kind, publication_status,
                            discoverability, published_at)
values
  ('dddddddd-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
   'Ecology 200', 'official', 'published', 'public', now()),
  ('dddddddd-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555',
   'Ecology 300', 'official', 'draft', 'private', null);

insert into public.skill_nodes (id, course_id, title, kind, xp_reward, x, y, sort_order, graded)
values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
   'Field sampling', 'topic', 60, 0, 0, 1, true),
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001',
   'Quadrat design', 'topic', 20, 1, 0, 2, true);

insert into public.missions (id, node_id, title, xp_reward, sort_order)
values ('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001',
        'Transects', 60, 1);

insert into public.enrollments (user_id, course_id, role)
values ('77777777-7777-7777-7777-777777777777', 'dddddddd-0000-0000-0000-000000000001',
        'student');

-- 0033 revoked both of these from `public` and called them internal. Asserted
-- as privileges rather than as a failing call because the privilege is the
-- claim: a `revoke ... from public` that leaves the `anon` and `authenticated`
-- grants standing reads identical in the migration and is a client call away in
-- the database.
do $$
begin
  assert not has_function_privilege('authenticated',
      'public.course_ladder_participants(uuid)', 'execute'),
    'the ladder predicates are not callable by a client';
  assert not has_function_privilege('anon',
      'public.course_ladder_participants(uuid)', 'execute'),
    'the ladder predicates are not callable by a client';
  assert not has_function_privilege('authenticated',
      'public.can_view_course_ladder(uuid, uuid)', 'execute'),
    'the ladder predicates are not callable by a client';
  assert not has_function_privilege('anon',
      'public.can_view_course_ladder(uuid, uuid)', 'execute'),
    'the ladder predicates are not callable by a client';

  -- The report that calls them both stays reachable. Revoking the predicates
  -- and not the thing they were factored out of is the whole shape of the fix.
  assert has_function_privilege('authenticated',
      'public.student_leaderboard(uuid)', 'execute'),
    'the ladder predicates are not callable by a client';
end $$;

do $$
begin
  assert not has_function_privilege('authenticated',
      'public.node_prerequisites_mastered(uuid, uuid)', 'execute'),
    'node_prerequisites_mastered is not callable by a client';
  assert not has_function_privilege('anon',
      'public.node_prerequisites_mastered(uuid, uuid)', 'execute'),
    'node_prerequisites_mastered is not callable by a client';
end $$;

-- The rest of the sweep, by name rather than one assert each. A new definer
-- helper added to this list without its revoke fails here instead of in an
-- audit.
do $$
declare v_reachable text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_reachable
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.proname in (
      'can_record_course_progress', 'write_admin_audit',
      'audit_course_change', 'audit_enrollment_change',
      'enforce_course_distribution_authority', 'enroll_student_course_owner',
      'handle_new_user_profile', 'protect_mission_progress_award',
      'protect_node_progress_award', 'sync_mission_course',
      'sync_prereq_course', 'verify_instructor_on_signup')
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'));

  assert v_reachable is null,
    'no internal definer helper is callable by a client';
end $$;

-- 0013's node DELETE, which `owns_course` widened to administrators in 0028.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
delete from public.skill_nodes where id = 'eeeeeeee-0000-0000-0000-000000000001';
reset role;

-- And the owner of that course, on the spare node, to show the policy still
-- permits what it was written to permit.
select set_config('request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
set local role authenticated;
delete from public.skill_nodes where id = 'eeeeeeee-0000-0000-0000-000000000002';
reset role;

do $$
begin
  assert (select count(*) from public.skill_nodes
          where id = 'eeeeeeee-0000-0000-0000-000000000001') = 1,
    'an administrator cannot delete another instructor''s node, its owner can';
  -- The cascade is the reason this one matters rather than the row count: the
  -- missions on that node, and every learner record hanging off them, go with it.
  assert (select count(*) from public.missions
          where id = 'ffffffff-0000-0000-0000-000000000001') = 1,
    'an administrator cannot delete another instructor''s node, its owner can';
  assert (select count(*) from public.skill_nodes
          where id = 'eeeeeeee-0000-0000-0000-000000000002') = 0,
    'an administrator cannot delete another instructor''s node, its owner can';
end $$;

-- 0004's help gate, reached the way 0022 made reachable: join from the catalog,
-- then re-price the owner's node.
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
select public.join_published_course('dddddddd-0000-0000-0000-000000000001');

do $$
declare v_refused boolean := false;
begin
  begin
    perform public.request_help_subtree(
      'eeeeeeee-0000-0000-0000-000000000001', 10,
      jsonb_build_array(
        jsonb_build_object('id', '5a5a5a5a-0000-0000-0000-000000000001',
          'title', 'Step 1', 'description', '', 'kind', 'topic',
          'xp_reward', 25, 'x', 2, 'y', 0, 'sort_order', 1),
        jsonb_build_object('id', '5a5a5a5a-0000-0000-0000-000000000002',
          'title', 'Step 2', 'description', '', 'kind', 'topic',
          'xp_reward', 25, 'x', 3, 'y', 0, 'sort_order', 2)),
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'id', 'ffffffff-0000-0000-0000-000000000001', 'xp_reward', 10)));
  exception when others then
    v_refused := true;
  end;
  assert v_refused,
    'a self-service joiner cannot re-price an official course';
end $$;
reset role;

do $$
begin
  -- The refusal above could also be a malformed request. These two are what the
  -- attack actually took, so they are what proves it did not land.
  assert (select xp_reward from public.skill_nodes
          where id = 'eeeeeeee-0000-0000-0000-000000000001') = 60,
    'a self-service joiner cannot re-price an official course';
  assert (select count(*) from public.skill_nodes
          where parent_node_id = 'eeeeeeee-0000-0000-0000-000000000001') = 0,
    'a self-service joiner cannot re-price an official course';
end $$;

-- 0030's roster fallback, on a course with nobody enrolled on it.
select set_config('request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  -- 0041 stopped the fallback listing colleagues; 0042 stopped it reaching a
  -- verified instructor at all. The reason is that 0028 grants the badge to
  -- anyone who picks the instructor tab at sign-up, so "verified" was never a
  -- boundary here — an administrator proved it by registering, making an empty
  -- course, and reading five strangers' email addresses.
  begin
    perform public.course_roster('dddddddd-0000-0000-0000-000000000002');
    assert false, 'a verified instructor cannot read the roster fallback';
  exception when sqlstate '42501' then
    null;
  end;
end $$;
reset role;

-- The administrator still gets it, and still without colleagues in it.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.course_roster('dddddddd-0000-0000-0000-000000000002') r
                     where r.user_id = '11111111-1111-1111-1111-111111111111'),
    'the roster fallback does not disclose colleagues';
  -- An account that is neither staff nor enrolled is a learner and is still
  -- listed. Excluding everybody would pass the assert above and break the
  -- feature it is guarding.
  assert exists (select 1 from public.course_roster('dddddddd-0000-0000-0000-000000000002') r
                 where r.user_id = '66666666-6666-6666-6666-666666666666'),
    'the roster fallback still lists learners for an administrator';
end $$;
reset role;

-- 0037's course trigger, on the column that decides who may use every other
-- policy on the row.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
update public.courses set owner_id = '22222222-2222-2222-2222-222222222222'
  where id = 'dddddddd-0000-0000-0000-000000000002';
reset role;

do $$
declare v_row public.admin_audit_log;
begin
  select * into v_row from public.admin_audit_log where action = 'course.owner_changed';

  assert (select count(*) from public.admin_audit_log
          where action = 'course.owner_changed') = 1,
    'taking ownership of a course is recorded';
  -- The hat is read from the old owner. Taken from NEW, the administrator who
  -- just made themselves the owner files their own seizure as housekeeping.
  assert v_row.actor_role = 'administrator',
    'taking ownership of a course is recorded';
  assert v_row.subject_user_id = '22222222-2222-2222-2222-222222222222'::uuid,
    'taking ownership of a course is recorded';
  assert v_row.detail ->> 'was' = '55555555-5555-5555-5555-555555555555',
    'taking ownership of a course is recorded';
  -- Denormalised for the reason 0036 gives for actor_name: the account this was
  -- taken from may be erased, and "taken from somebody" is not an audit row.
  assert v_row.detail ->> 'was_name' = 'E. Author',
    'taking ownership of a course is recorded';
end $$;

-- 0033's instructor exclusion, against 0028's revocation-as-a-stamp.
insert into public.verified_instructors (user_id, revoked_at)
  values ('77777777-7777-7777-7777-777777777777', now())
  on conflict (user_id) do update set revoked_at = now();

select set_config('request.jwt.claims',
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.student_leaderboard('dddddddd-0000-0000-0000-000000000001')
          where is_current_user) = 1,
    'a revoked badge does not hide a student from their own ladder';
end $$;
reset role;

-- The same account with the badge live. 0029's rule is what this half protects:
-- fixing the revoked case by dropping the exclusion would pass the assert above
-- and put every instructor back on the learner ladder.
update public.verified_instructors set revoked_at = null
  where user_id = '77777777-7777-7777-7777-777777777777';

select set_config('request.jwt.claims',
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.student_leaderboard('dddddddd-0000-0000-0000-000000000001')
          where is_current_user) = 0,
    'a revoked badge does not hide a student from their own ladder';
end $$;
reset role;

rollback;
