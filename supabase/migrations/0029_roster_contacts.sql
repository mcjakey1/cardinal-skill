-- A roster an instructor can act on: name, email, and whether it is real enrolment.
--
-- THIS OPENS A READ THAT 0001 AND 0005 BOTH LEFT SHUT, AND THE REASONING BELONGS
-- HERE RATHER THAN IN A COMMIT MESSAGE. 0001 put every account's email in
-- `auth.users`, which no client can select from at all. 0005 widened the
-- instructor read as far as a student's *display name* and stopped there — its
-- roster function returns `display_name` and progress figures and no contact
-- detail of any kind. An instructor who wants to reach a student who has cleared
-- nothing in a fortnight currently cannot, which is the whole point of the flag
-- 0005 added.
--
-- WHAT OPENS
--   `course_roster(course_id)` returns, to the owner of that course or to an
--   Administrator, one row per person with:
--     * their display name          (profiles.display_name, as 0005 already allows)
--     * their sign-in email         (auth.users.email — new, and the reason this
--                                    file exists)
--     * whether they are enrolled   (a fact about the enrolment, not about them)
--
-- WHAT STAYS SHUT
--   * Everyone else. The function checks in its own body that the caller owns
--     the named course or is an Administrator, and raises otherwise. It is
--     `security definer` — that check is the only thing between a caller and a
--     list of email addresses, so it is written out here rather than delegated
--     to `owns_course`, whose meaning 0028 already widened once.
--   * Reading it without naming a course. There is no argument-free form and no
--     view. A caller who owns no course can call this all day and get an
--     exception every time.
--   * Writes. This is `stable` and selects only. Enrolling and removing people
--     stays where 0028 put it, behind `admin_set_enrollment`.
--   * Passwords, tokens, metadata, confirmation state. One column of
--     `auth.users` is exposed, `email`, and it is named explicitly.
--   * Instructor accounts. The fallback below lists learner accounts, not
--     colleagues. An instructor's email is not disclosed to another instructor.
--   * Progress. Names and addresses only. What a student has cleared still comes
--     from 0005's `course_student_progress`, under 0005's rules, for the enrolled
--     students it already covers.
--   * Anon and public. Revoked at the bottom, granted to `authenticated` only.
--
-- THE FALLBACK, AND WHY IT IS TEMPORARY
--   Nothing in this product enrols a student on an instructor's course. The only
--   writers of `enrollments` with role 'student' are 0020's trigger, which fires
--   only when the course *owner* signed up as a student, and 0022's
--   `join_published_course`, which needs the course published to the catalog and
--   a second account to join it. So an instructor's own course has an empty
--   student roster by construction, and 0005's roster function correctly returns
--   zero rows for it. That is the reported "the roster does not load".
--
--   Until instructors can add students — the stated next step — this function
--   falls back to listing registered learner accounts, with `enrolled = false`
--   on every row so a caller cannot mistake the two. THIS IS THE WIDEST THING
--   THIS FILE OPENS: for as long as no student is enrolled on the named course,
--   its owner can see the name and email of every registered learner, not only
--   their own students. It is deliberate and it is bounded in time — the moment
--   one student is enrolled on that course, the fallback stops firing for it and
--   the roster is exactly the enrolled set. When explicit enrolment ships,
--   delete the `else` branch below and this widening ends with it.
--
-- The caller is never on their own roster. An instructor is not their own
-- student, and their own address is not news to them.

create or replace function public.course_roster(p_course_id uuid)
returns table (
  user_id      uuid,
  display_name text,
  email        text,
  enrolled     boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_any_enrolled boolean;
begin
  if v_caller is null then
    raise exception 'Sign in as the owner of this course to open its roster.'
      using errcode = '42501';
  end if;

  -- Written out rather than calling owns_course, which 0028 redefined to mean
  -- "owner or administrator" on behalf of five migrations' worth of callers.
  -- This read is personal data and states its own gate.
  if not (
    exists (
      select 1 from public.courses c
      where c.id = p_course_id and c.owner_id = v_caller
    )
    or public.is_administrator(v_caller)
  ) then
    raise exception 'You can only open the roster for a course you own.'
      using errcode = '42501';
  end if;

  select exists (
    select 1 from public.enrollments e
    where e.course_id = p_course_id and e.role = 'student'
  ) into v_any_enrolled;

  -- The fallback below lists learner accounts that are NOT on this course, so
  -- its gate cannot be course ownership. 0027 makes creating a course
  -- self-service — `create policy "create own courses" ... with check (owner_id
  -- = auth.uid())` — so "the owner of a course" is a description of anyone who
  -- signed up and inserted one row. Owner-gating a system-wide directory of
  -- names and addresses is therefore no gate at all: register, create a course,
  -- enrol nobody, read every learner's email, forever.
  --
  -- So the fallback additionally requires a verified instructor or an
  -- administrator. That is not a strong boundary and this comment will not
  -- pretend otherwise: 0028 verifies anyone who registers as an instructor, so
  -- the cost of reaching this list is choosing the instructor tab at sign-up.
  -- It is the boundary this product already accepted when it opened the
  -- official catalog on the same signal, and an administrator can revoke it.
  -- The enrolled path above stays owner-or-administrator and is unaffected.
  --
  -- To close it properly, delete the fallback and ship the enrolment write, or
  -- narrow this to `public.is_administrator(v_caller)` alone — one line, and
  -- the roster then shows addresses only to an administrator until enrolment
  -- exists.
  if not v_any_enrolled
    and not (public.is_verified_instructor(v_caller) or public.is_administrator(v_caller))
  then
    raise exception 'Only a verified instructor can see learner accounts that are not enrolled on this course.'
      using errcode = '42501';
  end if;

  return query
    select
      u.id,
      -- The same allowance 0005 makes: a missing or blank profile is not a
      -- reason to fail a roster, and the address below identifies the person
      -- regardless.
      coalesce(nullif(p.display_name, ''), 'Unnamed student')::text,
      u.email::text,
      v_any_enrolled
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id <> v_caller
      and u.deleted_at is null
      and case
        when v_any_enrolled then
          exists (
            select 1 from public.enrollments e
            where e.course_id = p_course_id
              and e.user_id = u.id
              and e.role = 'student'
          )
        else
          -- The fallback. Learner accounts only: an account that signed up as an
          -- instructor is a colleague, not a student, and is not listed. An
          -- account with no role recorded is treated as a learner, which is what
          -- 0020 and 0028 both assume of unlabelled accounts.
          coalesce(u.raw_user_meta_data ->> 'role', 'student') <> 'instructor'
      end
    order by 2, 3;
end;
$$;

comment on function public.course_roster(uuid) is
  'Name and email for one course''s students, to its owner or an administrator. Rows with enrolled = false are registered accounts listed because nobody is enrolled on the course yet.';

revoke all on function public.course_roster(uuid) from public, anon;
grant execute on function public.course_roster(uuid) to authenticated;
