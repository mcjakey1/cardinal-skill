# Cardinal Skill

Cardinal Skill turns a course syllabus into a navigable prerequisite graph. A student
uploads the document their instructor actually handed them, an AI parser converts it into
a graph of learning nodes, and completing coursework unlocks nodes and earns XP.

The question the whole product exists to answer is a student's: **what should I do next,
and does it matter?** Traditional course tools show urgency but never progress; gamified
ones show progress but imply the work was trivial. This aims at the register in between —
the effort is being recorded seriously, and the record is worth looking at.

One Expo + React Native codebase ships to web, iOS, and Android. Expo Router owns
navigation, Supabase provides auth and data with Row Level Security as the privacy
boundary, and Edge Functions keep every AI provider key out of the client bundle.

---

## Contents

- [How it works](#how-it-works)
- [Features](#features)
- [Roles and permissions](#roles-and-permissions)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Connecting your own Supabase project](#connecting-your-own-supabase-project)
- [The AI pipeline](#the-ai-pipeline)
- [The audit log](#the-audit-log)
- [Project layout](#project-layout)
- [Commands](#commands)
- [Security model](#security-model)
- [Further reading](#further-reading)

---

## How it works

```
syllabus (PDF/text)
   ↓  parse-syllabus Edge Function — Gemini, structured output
prerequisite graph of nodes + missions
   ↓  normalised: cycles broken, orphans attached, XP clamped
skill tree the student navigates
   ↓  complete missions
node mastered → XP banked → downstream nodes unlock
```

A node is not worth a number somebody typed on it. Its XP is the **sum of the missions
attached to it**, so a student who is half way through a node can see half its XP. Asking
for extra help re-slices that total across the missions and the new help steps — it never
mints new XP, and it never docks any.

---

## Features

### For students

| | |
| --- | --- |
| **Skill tree** | Left-to-right DAG with pan, pointer-centred zoom, minimap, focus-on-active-work, and preserved viewport between visits |
| **Node states** | Locked / available / mastered, encoded by shape and text label as well as colour |
| **Missions** | The work a node is made of. Complete them individually; XP accrues per mission, not in a lump |
| **Progression** | Prerequisite-gated unlocking that survives malformed AI output — cycles are quarantined, dangling references dropped, absurd XP clamped |
| **Extra help** | Request a scaffold subtree on a node you are stuck on. It re-slices that node's XP rather than inventing more |
| **Adaptive engine** | Adjusts pacing and next-quest ordering from observed struggle signals |
| **Record** | Level, XP curve, achievements, and an opt-in course leaderboard |
| **Study companion** | Contextual AI tutor scoped to the node you are looking at. It will not do your graded work |
| **Syllabus upload** | PDF, text, or Markdown, with live parser telemetry |
| **Course library** | Search, drag-ordering, rename, duplicate/fork, progress reset, deletion |
| **Themes** | Five persistent presets — Obsidian Blueprint, Cyber Neon, Emerald Terminal, Solar Warmth, Nord Frost — all contrast-checked |
| **Offline tolerance** | Course and progress caches on device, flushed to the server when it returns |

### For instructors

The instructor workspace at `/instructor` is a **deliberately conventional LMS interface**
— rail, topbar, breadcrumb, tables — for someone who already spends their week in Canvas
and should not have to learn a second interface to publish a syllabus. It has its own
token set (`src/theme/lms.ts`), separate from the student app's.

| | |
| --- | --- |
| **Authoring canvas** | Add, rename, connect and delete nodes; build prerequisite chains. Draws in the *student's* tokens on purpose, so you see the artifact as delivered |
| **Mission editing** | Per-mission XP with live node totals |
| **Syllabus import** | The same parser students use, with a review-and-publish step |
| **Chart publishing** | Diffed and validated before it reaches students; one publish is recorded as one event |
| **Students** | Your roster, with contact details for your own course only |
| **Class insights** | Cohort progress, bottleneck nodes, and pace — every aggregate suppressed entirely below five students, owner included |
| **Course distribution** | Practice (private), community (shareable), and official (institutional) kinds, each with its own publication rules |

### For administrators

| | |
| --- | --- |
| **Whole-site course list** | Every course, with publish / unpublish / archive on any of them |
| **Enrolment** | Put anyone on any course, or take them off. Progress survives removal |
| **Verification** | Grant and revoke the verified-instructor badge |
| **Administrators** | Grant and revoke administrator status — but never your own, which would be a lockout rather than a moderation action |
| **Audit log** | See [below](#the-audit-log) |

---

## Roles and permissions

There are four levels, and they are enforced in the **database**, not the app.

**Student** — the default. Reads their own progress, their own courses, and whatever the
public catalog exposes.

**Instructor** — chosen at sign-up. Reads the enrolment, name, node and mission progress,
and XP of students on courses they own, through `course_student_progress`. Every policy
that grants this is `for select`; writes stay at `user_id = auth.uid()`.

**Verified instructor** — required to create or publish an *official* course. Verification
is granted automatically by a trigger when an account signs up with the instructor role,
and revoked by an administrator. Revocation is a `revoked_at` stamp rather than deleting
the row, specifically so a revoked account cannot re-verify itself by signing up again or
by rewriting its own user metadata.

**Administrator** — acts outside their own ownership. Note what deliberately stays shut:
an administrator can archive any course but **cannot delete** one, because deletion
cascades away learner records; removal is archival by design.

### Making the first administrator

`administrators` has no authenticated write path, on purpose. The first row is inserted
out of band — in the Supabase SQL editor for a hosted project:

```sql
insert into public.administrators (user_id, granted_by)
values ('<auth-user-uuid>', '<auth-user-uuid>');
```

After that, an administrator grants the status to others in the app.

The admin area also sits behind a local password (`src/lib/admin.ts`). That password
decides only what the screen *shows*. Every action behind it goes through an RPC that
re-checks `is_administrator()` in its own body, and RLS checks again on the tables
underneath — so an account that is not an administrator gets a page that refuses
everything.

---

## Requirements

- Node.js 22+
- npm
- Docker Desktop — only for running Supabase locally
- A Supabase project and the Supabase CLI, for a hosted deployment
- A Google AI Studio **Gemini** API key — syllabus parsing
- A **b.ai** API key — study companion and help subtrees

---

## Quick start

### Against a local Supabase

```bash
npm install
npx supabase start          # Postgres, auth, PostgREST in Docker
npx supabase db reset       # apply migrations 0001–0041
```

`supabase start` prints an API URL and anon key. Put them in `.env`:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the anon key it printed>
```

Then:

```bash
npm run web                 # http://localhost:8081
```

Supabase Studio is at <http://127.0.0.1:54323> if you want to look at the tables.

> **Windows note:** Supabase's local stack needs WSL2. If Docker reports "WSL needs
> updating", run `wsl --update` from an **elevated** PowerShell — a non-elevated shell
> fails with `REGDB_E_CLASSNOTREG`, which reads like a broken install and is not one.

### Other targets

```bash
npm start                   # dev server; press w / i / a
npm run android
npm run ios
```

The launch scripts start Expo web directly:

```bash
launch-cardinal-skill.bat   # Windows
./launch-cardinal-skill.sh  # Unix
```

If Metro serves a stale bundle, clear its cache: `npm run web -- --clear`.

---

## Connecting your own Supabase project

```bash
cp .env.example .env        # fill in the two EXPO_PUBLIC_ values
npx supabase link --project-ref <your-project-ref>
npx supabase db push --linked
npx supabase secrets set BAI_API_KEY=<key> GEMINI_API_KEY=<key>
npx supabase functions deploy parse-syllabus
npx supabase functions deploy study-companion
npx supabase functions deploy suggest-subtree
```

`EXPO_PUBLIC_*` values are compiled into the app bundle and readable by anyone who
installs it. That is fine for these two and only these two: the anon key grants nothing on
its own because every table is behind RLS. `BAI_API_KEY`, `GEMINI_API_KEY`, and the
service-role key must never carry an `EXPO_PUBLIC_` name or appear in client code.

---

## The AI pipeline

| Feature | Provider | Model | Edge Function |
| --- | --- | --- | --- |
| Syllabus → skill tree | Google Gemini | `gemini-3.1-flash-lite` | `parse-syllabus` |
| Study companion | b.ai | `deepseek-v4-flash` | `study-companion` |
| Extra-help subtree | b.ai | `deepseek-v4-flash` | `suggest-subtree` |

PDFs are handed to Gemini as native inline PDF input. Generated graph JSON is constrained
by a response schema, then **normalised before anything is persisted**: cycles broken,
orphans attached, dangling prerequisites dropped, XP and minutes clamped per difficulty.

The rules that govern this boundary, and why:

- **Authorize before you spend.** The pipeline costs real money and takes minutes. RLS
  makes a course readable to everyone enrolled, so a *readable* course is not an *owned*
  one — ownership is checked before the first provider call, not after.
- **A refusal is an HTTP 200.** Gemini signals one with `finishReason` or
  `promptFeedback.blockReason` and no text, so those are checked *before* reading the
  candidate's content. Otherwise an empty-parts refusal looks like an empty response and
  gets retried at full price.
- **Structured output, not prompt-and-hope.** The 400 fallbacks are gated on the provider
  naming the field it rejected, so an unrelated 400 surfaces instead of silently re-running
  the call without its schema.
- **Syllabus text is data, never instructions.** It is fenced in tags with explicit
  framing, and every model-supplied id is re-validated against the allowed set before any
  write.
- **Every client-supplied string that reaches a system prompt is bounded** — item and
  length caps — on the authenticated path as well as the demo one.

The parser's status indicator validates the configured key and model without consuming
inference tokens.

---

## The audit log

An append-only record of actions taken outside a person's own ownership, readable by
administrators.

**What it records:** course creation, publication, unpublication, archival, renaming by a
non-owner, deletion, and **ownership transfer**; chart publishes with their node and
mission counts; mission edits by a non-owner; people added to or removed from a course by
somebody other than themselves; co-instructor role changes; verification granted and
revoked; administrator status granted and revoked.

**What it deliberately does not record:** students joining or leaving a course on their
own, an instructor renaming or editing their own course, a chart publish that changed
nothing, and reads. A read log over student data is a much larger promise and needs its own
design.

**Why you can trust it.** Rows are written by database triggers and `security definer`
functions, never by a client — a client that logs its own actions is one modified client
away from logging none of them. There is no UPDATE policy and no DELETE policy on the
table, for anyone, administrators included. Foreign keys are `on delete set null` rather
than cascade, and the actor's name is resolved at write time, so erasing an account does
not erase the record of what it did while it held authority.

**The screen** offers filtering by actor, action group, date range and subject; free-text
search; keyset pagination; drill-through to the affected course or roster; a
recent-activity summary over the whole record; and CSV export carrying a provenance header
naming what was exported, when, and under which filter.

---

## Project layout

```text
app/                          Expo Router routes — file path is URL path
  index.tsx                   Sign-in / register
  courses/, tree/[courseId]   Student course list and skill tree
  missions.tsx, record.tsx    Mission board, XP and achievements
  companion.tsx, upload.tsx   Study companion, syllabus upload
  profile.tsx, system.tsx     Profile, settings
  instructor.tsx              The instructor workspace and admin area
src/
  auth/                       Session context and auth UI
  features/skilltree/         Graph types, pure progression rules, layout, chart UI
  lib/                        Supabase client, caches, adapters, admin logic
  theme/tokens.ts             Every colour, type and spacing value — student app
  theme/lms.ts                The same, for the instructor workspace only
  ui/                         Cross-platform components, navigation, transitions
supabase/
  migrations/                 Forward-only schema and RLS policies (0001–0041)
  functions/                  Deno Edge Functions; server-only secrets
  tests/audit_trail.sql       116 assertions over the audit and authority rules
```

---

## Commands

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint
npm test             # node --test over src/, app/, and supabase/functions/
npm run test:db      # SQL assertions against the local database
npm run build:web    # production web bundle
npm run fn:serve     # Edge Functions locally (loads .env)
npm run db:reset     # re-apply every migration
```

`npm test` uses Node's built-in test runner — there is no test framework to install. Pure
logic lives in plain `.ts` files with no React and no network so it can be checked this
way; `src/features/skilltree/progression.ts` is the model to follow.

`npm run test:db` executes `supabase/tests/audit_trail.sql` through `docker exec` against
the local Supabase container, because `psql` is usually not on `PATH` on Windows. It
expects a freshly reset database — several assertions count rows from zero.

---

## Security model

These are the rules a change must not break.

**RLS is the access control, not the query.** Never add `.eq('user_id', ...)` to a client
query *as a security measure*. It looks like the control and isn't — a modified client
just omits it. Scope data in the policy; if a student can read something they shouldn't,
fix the migration.

**Secrets never reach the client.** Any code that calls an AI provider goes in
`supabase/functions/`, never in `app/` or `src/`.

**Student data is minimised and opt-in.** Social visibility is off by default behind an
explicit `social_opt_in` flag governing what *peers* see.

**Cohort aggregates are suppressed below five students.** Every summary function ends in
`having count(*) >= 5`, and the course owner is not exempt — below five, no row is
returned rather than a row with a small number in it, because on a three-person seminar
"2 mastered" often names a person. `course_cohort_summary` suppresses the student count
itself for the same reason. An owner's un-floored read of individual students is a
separate function (`course_student_progress`), not a relaxation of this one.

**An instructor reads their own students, and only reads.** Nothing reaches outside a
course the caller owns, and each check goes through a `security definer` helper because a
policy on `enrollments` that read `courses` back would recurse.

**AI output is untrusted input.** Validate at the boundary; do not assume a well-formed
graph downstream.

**Internal helpers are not client-callable.** `revoke all … from public` does *not* remove
Supabase's `anon`/`authenticated` grants — both must be named explicitly, or a
`security definer` helper becomes an oracle any signed-in account can query.

**Every platform, every change.** No `Platform.OS` branch without a comment saying why the
platforms genuinely differ.

**Accessibility is not a later pass.** Status is encoded by shape and text as well as
colour, interactive elements carry a label and a role, controls meet a 44dp touch floor,
and animation is skipped under reduce-motion.

---

## Definition of done

A change is finished when `npm run typecheck`, `npm run lint` and `npm test` pass, it has
been checked on web and on at least one native platform, new non-trivial logic has one
runnable check beside it, and any new table ships its RLS policies in the same migration.

The migrations are the most reliable documentation in this repository. They are written to
explain the constraint behind each decision rather than to narrate the SQL, so when the
question is "why is it like this", the migration that introduced it is usually the answer —
`0001_init.sql` for the privacy boundary, `0028` for administrator authority, `0036`–`0042`
for the audit trail and the gaps closed around it.
