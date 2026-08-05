# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Two audiences, two surfaces, one product.

**The student app** ships to web, iOS, and Android from one Expo codebase. Its
design language is the product's own and does not change per operating system, so
this record is `web` rather than `adaptive` — but every decision there must
survive a phone screen and a native build, not just a desktop browser.

**The instructor workspace** (`frontend/`, Next.js) is desktop-first and
deliberately conventional; see Brand Commitments. Until 2026-08-05 this app also
carried a second, contradictory student experience — a cream-and-rounded
`Welcome`, `Onboarding` and `dashboard`. Those were retired so a student meets
one interface on every device.

## Users

**Primary: the student.** Someone carrying roughly five courses who opens the app
between classes, on a phone, often on a slow connection. Their question is "what
should I do next, and does it matter?" Everything is built to answer that.

**Supporting: the instructor.** Authors and curates a course's skill tree, names
quests and achievements, and adds supplemental help when a student is stuck. The
instructor's tools exist to make the student's answer better. When the two
audiences conflict, the student's clarity wins.

## Product Purpose

Turn a course syllabus into a navigable prerequisite graph of learning nodes.
An AI parser converts an uploaded syllabus into a skill tree; completing
coursework unlocks nodes and earns XP.

Success is a student who can see where they are, what is open to them now, and
what their effort has actually built — instead of a flat list of due dates.

## Positioning

The mechanism is the **prerequisite graph derived from the student's own
syllabus**. Not a generic curriculum, not a course catalog — the actual document
their instructor handed them, restructured into what depends on what.

Two failure modes this is positioned against, both recorded in DESIGN.md:
traditional course tools show urgency but never progress; gamified education
tools show progress but imply the work was trivial. The intended register is that
the student's effort is being recorded seriously, and the record is worth looking
at.

## Operating Context

- Phone-first, between classes, frequently on a slow or metered connection.
- A course begins when a syllabus (PDF/DOCX) is uploaded and parsed. Instructors
  may also author a tree by hand; both paths converge on the same review-and-
  publish step.
- Students self-report completion today (`verified_by: 'self'`). Instructor
  confirmation and LMS sync are anticipated but not built.
- Roles are `student` and `instructor`, scoped per course through enrollments.

## Capabilities and Constraints

**Built:** syllabus parsing into nodes and prerequisite edges; prerequisite-gated
unlocking with cycle and dangling-reference tolerance; XP and levelling;
supplemental "extra help" subtrees that redistribute a node's XP rather than mint
new XP; an adaptive engine that adjusts pacing, next-quest ordering, and a
personal XP curve from observed struggle signals; instructor-authored trees.

**Two applications, split by audience.** The Expo app (`app/` + `src/`) is the
student's, on every device. The Next.js app (`frontend/`) is the instructor's:
authoring a course tree, reading class aggregates, importing a syllabus. Neither
one carries the other's audience.

The pure progression rules live once in `src/features/skilltree/` and are shared
by both through a path alias, under a single `node --test` suite. So do the
sixteen-colour tokens (`src/theme/tokens.ts`), the ordered dither
(`src/theme/dither.ts`), and the edge router (`edgeRouting.ts`) — the instructor's
authoring canvas draws with all four. Duplicating any of it is how a student ends
up seeing a node unlocked on the web and locked on their phone.

**Untrusted AI output.** Anything the parser returns can contain cycles, dangling
references, duplicate keys, or absurd values. It is validated at the boundary and
must never be assumed well-formed downstream.

**Privacy is a database boundary, not an app one.** Row Level Security scopes
every table. Social visibility is off by default behind an explicit opt-in flag.
Instructors read the progress of students on courses they own, by name, and
nothing outside those courses — the read Canvas and Google Classroom already
give an instructor of record, granted by policy in `0005_instructor_reads.sql`
rather than by a client-side filter. It is read-only: a student's record is
written only by that student. Grades stay out of it because Cardinal Skill does
not store any. Aggregates are still suppressed below five students, which now
guards figures shown to everyone who is *not* the course owner. This holds
regardless of deployment status.

**Grades and XP are separate.** Supplemental help nodes award XP but are never
graded — asking for help must not change what a course is worth, in either
direction.

**Open / undecided:** authentication is not wired (the web app runs on a mock
repository); the Supabase migrations and Edge Functions on disk have never been
executed; LMS integration, guilds, and instructor-verified completion are
roadmap, not fact.

## Brand Commitments

The product is named **Cardinal Skill**.

**Institutional context is placeholder, not product truth.** Mapúa University,
its campuses, the `@mymail.mapua.edu.ph` domain, and the `edu.cintana.cardinalskill`
identifier appear throughout the code as setting for a personal prototype. No
partnership, endorsement, or deployment agreement is confirmed. Future work must
not claim institutional affiliation, and must treat this branding as swappable.

**The instructor workspace is conventional on purpose. Standing preference,
recorded 2026-08-05.** The student app refuses the ed-tech dashboard; the
instructor workspace adopts it — sidebar, breadcrumbs, dense data tables, a light
institutional ground, a real icon library. The craft bar is Google Classroom and
the Stripe Dashboard for finish, Canvas and Brightspace for familiarity. It is
executed straight, at full fidelity, with no irony and no smuggled quirk. An
instructor who already lives in an LMS should not have to learn a second
interface to publish a syllabus.

One thing does not follow that rule, and it is not decoration: **the authoring
canvas draws the tree in the student's sixteen-colour grammar.** An instructor is
authoring the artifact a student receives, so the artifact is shown as delivered.
An authoring tool that renders its output in its own chrome cannot answer "what
will my class actually see", which is the one question a course author has that
nobody else does.

Voice and copy rules are already established and binding — see the Writing
section of DESIGN.md. In short: name what the student controls, an action keeps
its name through the flow, errors say what happened and what to do next, and the
student is never congratulated on trivia.

## Evidence on Hand

- `DESIGN.md` — the confirmed visual and written direction, with
  `src/theme/tokens.ts` as its machine-readable half.
- `AGENTS.md` — the engineering contract: stack, invariants, definition of done.
- `CardinalSkill.pdf` — an original project document in the repository. Its text
  could not be extracted programmatically here; treat its contents as unread
  rather than assumed.
- Six mock course datasets (`frontend/lib/cardinal-repository.ts`), including two
  deliberately invalid graphs, for exercising layout and validation.
- Five deterministic simulated learner profiles (`src/features/skilltree/learners.ts`)
  used to test the adaptive engine.

**Absent — do not fabricate:** real student users, usage data, pilot results,
testimonials, institutional endorsement, pricing, or deployment claims.

## Product Principles

1. **Answer "what next" above everything.** A screen that does not help a student
   choose their next move is decoration.
2. **Celebrate the record, not the student.** Progress is shown by the record
   changing, and that change is allowed to be an event: the chart wipes open, a
   streak counts up, a stamp lands. What stays banned is praise for trivia and
   any reward that implies the work was easy. The test is whether a celebration
   points at something the student actually did.

   Streaks, stamps, and levels are in. They are all **derived at read time** from
   the chart and the completion log, never stored, so they can never disagree
   with the work. No stamp mints XP — two students who do identical work must end
   up worth the same amount.
3. **Asking for help costs nothing.** Support is redistributive, never punitive
   and never a shortcut to a better grade.
4. **One rule, one implementation.** Shared logic lives in one place with one test
   suite; a rule that disagrees with itself across platforms is a broken promise.
5. **Privacy is structural.** It is enforced where the data lives, not where the
   interface happens to ask.

## Accessibility & Inclusion

A binding floor already exists in DESIGN.md and `AGENTS.md`, treated as a
requirement rather than a later pass:

- Status is never carried by colour alone — shape and a text label encode it too.
- Every interactive element has an accessible name and role; touch targets are at
  least 44×44pt, including chart nodes.
- Text scales with the OS setting without clipping; full keyboard traversal on web
  with a visible focus ring.
- Reduced motion is respected, and motion is never how information arrives.
- A low-bandwidth mode renders the chart in primitives only and must lose nothing
  but polish.
