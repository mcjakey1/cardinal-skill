-- An administrator can see the badges they are able to grant.
--
-- 0028 gave an administrator `admin_set_instructor_verification`, and left the
-- 0021 select policy on `verified_instructors` as it was: `user_id =
-- auth.uid()`. The result is a remedy nobody can aim. An administrator can
-- grant a badge and revoke a badge, and cannot read whether the account in
-- front of them holds one — so the screen either shows nothing, or shows every
-- account as unverified, which is a lie in the one direction that matters:
-- it invites a revoke on somebody who was never verified and hides the
-- instructor who is.
--
-- WHAT OPENS
--   SELECT on `verified_instructors`, to an administrator, over every row.
--   That is: which accounts are verified, when, by whom, and whether the row
--   carries a revocation. All four are facts about a moderation decision an
--   administrator is the one who makes.
--
-- WHAT STAYS SHUT
--   * Writes. `for select` only. Granting and revoking stay behind
--     `admin_set_instructor_verification`, which re-checks `is_administrator()`
--     in its own body, and behind the service-role
--     `set_instructor_verification`. 0028's reasoning about revocation being a
--     stamp rather than a delete is untouched by a read.
--   * Everyone else. This is a second permissive policy, ORed with 0021's, so
--     an ordinary account still reads exactly its own row and nothing more.
--   * `administrators`. Reading the roll of administrators is not needed to
--     work a badge, and 0028 deliberately keeps that table to "may I learn
--     whether I am one". Left alone.
--   * Names and addresses. This table holds neither. Who an account *is* still
--     comes from `profiles` under 0005's policy and from `course_roster` under
--     0030's, each with its own gate.

create policy "administrators read every verification"
  on public.verified_instructors
  for select
  using (public.is_administrator());
