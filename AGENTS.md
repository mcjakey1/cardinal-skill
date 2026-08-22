# AGENTS.md

The working contract for any coding agent in this repository. It is the canonical
file: `CLAUDE.md` defers to it and only adds Claude-specific notes.

## What this is

Cardinal Skill turns a course syllabus into a navigable skill tree. A student uploads
a syllabus, an AI parser converts it into a prerequisite graph of learning nodes,
and completing coursework unlocks nodes and earns XP.

One codebase ships to web, iOS, and Android. That constraint decides most of the
technical choices below — if a change works on only one platform, it is not done.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| App | Expo + React Native + Expo Router | One codebase, three platforms. Expo Router gives real URLs on web. |
| Language | TypeScript, `strict` | |
| Data & auth | Supabase (Postgres, Auth, Storage, Edge Functions) | Row Level Security is the FERPA boundary. |
| Server state | TanStack Query | |
| Charts | `react-native-svg` | Renders identically on all three platforms; no per-platform canvas code. |
| AI | Claude via a Supabase Edge Function | Keeps the API key server-side. |
| Native builds | EAS Build | |

## Layout

```
app/                      Expo Router routes. File path = URL path.
src/
  features/skilltree/     Tree types, pure progression rules, queries, chart UI.
  lib/                    Clients and adapters (Supabase).
  theme/tokens.ts         Every colour, font, and spacing value — student app.
  theme/lms.ts            The same, for the instructor workspace only.
supabase/
  migrations/             Schema and RLS policies. Forward-only.
  functions/              Deno Edge Functions. Server-only secrets live here.
```

## Commands

```bash
npm install
npm start          # dev server; press w / i / a for web, iOS, Android
npm run typecheck
npm run lint
npm test           # node:test, no framework
npm run build:web
supabase start     # local Postgres + auth
npm run db:reset   # re-apply migrations to the local database
```

## Invariants

These are the rules a change must not break. Everything else is a preference.

**Secrets never reach the client.** `EXPO_PUBLIC_*` variables are compiled into
the app bundle and readable by anyone who installs it. The Supabase anon key is
fine there because RLS gates every table. `ANTHROPIC_API_KEY` and the service
role key are not — they belong in Edge Function secrets. Any code that calls an
AI provider goes in `supabase/functions/`, never in `app/` or `src/`.

**RLS is the access control, not the query.** Do not add `.eq('user_id', ...)`
to a client query as a security measure. It looks like the control and isn't —
a modified client just omits it. Scope data in the policy; if a student can read
something they shouldn't, fix the migration.

**Student data is minimised and opt-in.** Grades, pace, and progress are personal
records. Social visibility (leaderboards, guilds) is off by default and stored as
an explicit `social_opt_in` flag — it governs what *peers* see and is not
consulted for the instructor read below.

**An instructor reads their own students, and only reads.**
`0005_instructor_reads.sql` lets the owner of a course select the enrolment,
name, node and mission progress, and XP of students on that course, through
`course_student_progress`. Every policy it adds is `for select`; writes stay at
`user_id = auth.uid()`. Nothing reaches outside a course the caller owns, and
each check goes through a `security definer` helper (`owns_course` and friends)
because a policy on `enrollments` that read `courses` back would recurse.
Aggregates keep their five-student floor for every reader who is not the owner.

**AI output is untrusted input.** The syllabus parser produces a graph that can
contain cycles, dangling references, or absurd XP values. Validate at the
boundary — `deriveStatuses` already handles cycles and unknown ids, and the
database has `check` constraints. Do not assume a well-formed graph downstream.

**Every platform, every change.** No `Platform.OS` branch without a comment
saying why the platforms genuinely differ. Prefer an API that works on all three.

**Accessibility is not a later pass.** Node status is encoded by shape and a text
label as well as colour. Interactive elements have an `accessibilityLabel` and a
`accessibilityRole`. Animation is skipped when reduce-motion is on.

## Conventions

- Pure logic lives in plain `.ts` files with no React and no network calls, so it
  can be tested with `node --test`. `progression.ts` is the model to follow.
- Tokens from `src/theme/tokens.ts`. A raw hex value or magic spacing number in a
  component is a bug — see `DESIGN.md`.
- One exception, and only one: `/instructor` is a conventional LMS workspace by
  design and takes its tokens from `src/theme/lms.ts` (brief: `DESIGN.md`)
  with parts in `src/ui/lms.tsx`. Do not mix the two sets in one screen. The
  authoring canvas inside that workspace is the deliberate crossing — it draws in
  the student's tokens so an instructor sees the artifact as delivered.
- Copy is UI text: sentence case, active voice, name the thing the student
  controls. An error says what happened and what to do next.
- Migrations are forward-only and numbered. Never edit one that has been applied.
- Comments explain constraints the code can't show. Do not narrate the next line.

## Definition of done

`npm run typecheck`, `npm run lint`, and `npm test` pass; the change was checked
on web and on at least one native platform; new non-trivial logic has one runnable
check; RLS policies were updated in the same migration as any new table.
