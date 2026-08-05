# Expo port — remaining work

Plan for finishing the port of `frontend/` (Next.js prototype) into the Expo root
app, so `frontend/` can be deleted. Written to be executed by several agents in
parallel in a fresh session.

**Read first, in this order:** `AGENTS.md` → `DESIGN.md` → `PRODUCT.md` → this file.
Then `graphify query "<your question>"` before opening source (repo rule, see
`CLAUDE.md`).

**Status: WP1–WP10 are all done.** 118 tests passing, typecheck clean, lint
clean, design detector clean. §2 still governs any further change. What remains
is not a work package but the five open decisions in §6 — chiefly **auth**, and
**applying the migrations**, neither of which has ever run against a real
database. §7 lists what is still true before `frontend/` can be deleted.

---

## 1. Where things stand

### Decisions already made (do not re-litigate)

| Decision | Value |
|---|---|
| Visual world | PC-98 sixteen-colour field, cardinal-led. Seed key `074148ac` |
| Scope | Chart, missions, record, syllabus authoring, profile, settings, instructor, welcome, companion |
| Out of scope | Auth, onboarding, universal tracks |
| Companion + Instructor | Ship as **marked prototypes** — visual parity, labelled in-app as not wired |
| Missions storage | Real Supabase table (`0003_missions.sql`), local record as the offline path |
| Chart canvas | **Unbounded canvas** (2026-08-05). Pan, zoom, fit, and drag-to-move nodes, with a `ChartTools` strip over it |
| One codebase | Instructor and student ship from the Expo root. `frontend/` is for deletion (§7) — the instructor surface is the same chart with write access, not a second app |
| LMS / LTI | Planned, **not now.** No LMS partner yet, so LTI launch is parked rather than built. See §6.6 before it starts |

### Done

- Whole app rebuilt in the new visual world. `DESIGN.md` + `.impeccable/design.json`
  describe it and are ground truth.
- `app/+html.tsx` — web shell: title, meta, OG, `#0A0407` painted pre-mount,
  focus ring, scrollbars, `::selection`.
- Six tested logic seams: `autoLayout.ts`, `validation.ts`, `missions.ts`
  (extended), `naming.ts`, `rollup.ts`, `src/lib/store.ts`.
- Missions end to end: migration, queries, local log, chart detail window,
  `/missions` screen, fifth nav cell.
- **WP1 — manual authoring.** `app/author.tsx`: node form, node list, live
  validation, publish gated on `isValid`, draft autosaved through
  `createStore`. Reached from `/upload`.
- **WP2 — quest naming.** `naming.ts` (+10 tests) is the precedence rule;
  `src/lib/questNames.ts` holds device overrides; the chart, detail window and
  REQUIRES list all render the resolved name; `queries.ts` now reads
  `quest_title`, `quest_subtitle`, `title_override`. `name-quest` is invoked for
  real from `/author` after a publish.
- 87 tests passing.

### Screens that exist

`app/index.tsx` (boot) · `app/courses/index.tsx` · `app/tree/[courseId].tsx` ·
`app/missions.tsx` · `app/record.tsx` · `app/system.tsx` · `app/upload.tsx` ·
`app/author.tsx` · `app/profile.tsx` · `app/instructor.tsx` · `app/companion.tsx`

All eleven routes return 200 and carry exactly one `<title>` and one
`<meta name="description">`, server-rendered.

### What is stored on the device

Auth is not wired, so several screens keep their own record. Every key is
`cardinal.<thing>.v<n>[.<courseId>]`, and anything new should match:

| Key | Written by | Shape |
|---|---|---|
| `cardinal.prefs.v1` | `src/lib/prefs.tsx` | motion, bandwidth, last course |
| `cardinal.progress.v1.<courseId>` | `src/lib/progress.ts` | node id → ISO timestamp |
| `cardinal.missions.v1.<courseId>` | `src/lib/progress.ts` | mission id → ISO timestamp |
| `cardinal.questnames.v1.<courseId>` | `src/lib/questNames.ts` | node id → typed title |
| `cardinal.signals.v1.<courseId>` | `src/lib/signals.ts` | node id → time open, visits, help asked |
| `cardinal.author.v1` | `app/author.tsx` | the unpublished chart draft |
| `cardinal.profile.v1` | `app/profile.tsx` | the student's own details |
| `cardinal.instructorpreview.v1` | `app/instructor.tsx` | preview gate unlocked — **not** a session |
| `cardinal.layout.v1.<courseId>` | `src/lib/nodeLayout.ts` | node id → where it was dragged to |

Nothing in this table leaves the device. `cardinal.signals.v1.*` in particular is
pacing observation, not a record of achievement — no instructor query reads it
and none should.

New ones go through `createStore` (`src/lib/store.ts`) — versioned envelope,
corrupt value reads as the fallback, version mismatch discards rather than
migrates. `prefs.tsx` and `progress.ts` predate it and still hand-roll the
try/catch; that is worth collapsing but is not urgent.

---

## 2. Ground rules for every agent

Non-negotiable. A change that breaks one of these is wrong even if it works.

1. **Tokens only.** Every colour, size, and gap comes from `src/theme/tokens.ts`.
   A raw hex or magic number in a component is a bug. There are exactly sixteen
   colours; a seventeenth is a dither pair, not a new token.
2. **Reuse the UI kit.** `src/ui/pixel.tsx` (`PixelText`, `PixelButton`,
   `PixelIcon`, `Bevel`, `bevelStyle`, `Meter`, `Toggle`, `PixelInput`,
   `StatusTag`), `src/ui/Window.tsx`, `src/ui/Dither.tsx`, `src/ui/NavBar.tsx`.
   Do not write a second button.
3. **No gradients, no shadows, no rounded corners.** Depth is a 2dp bevel.
   Intermediate tone is a 4×4 Bayer dither. See `DESIGN.md` → Do's and Don'ts.
4. **Pure logic goes in `src/features/skilltree/`**, with no React and no network,
   so it runs under `node --test`. `progression.ts` is the model.
5. **One rule, one implementation.** Before writing a helper, check
   `progression.ts`, `missions.ts`, `subtree.ts`, `adaptive.ts`, `rollup.ts`,
   `validation.ts`, `autoLayout.ts`, `achievements.ts`, `naming.ts`. Most of what
   you need already exists. In particular: **never call `node.title` directly on
   a user-facing surface** — call `resolveQuestName(node, override)`, or the
   screen will show a syllabus title where every other screen shows the quest
   name.
6. **RLS is the access control.** Any new table ships with its policies in the
   same migration. Never add `.eq('user_id', ...)` to a client query as a
   security measure.
7. **Accessibility is not a later pass.** `accessibilityLabel` + role on every
   interactive element, 44dp minimum touch target, status never by colour alone,
   motion skipped under `usePrefs().motionOff`.
8. **Copy rules** — sentence case, active voice, name what the student controls,
   errors say what happened and what to do next. No eyebrow labels above
   headings. See `DESIGN.md` → Typography → The Uppercase-Is-Chrome Rule.
9. **Never fake a capability.** If it isn't wired, the screen says so. A log
   window that reports systems the build does not have is the one thing this
   grammar must not be used for.

### Verify before reporting done

```bash
npm run typecheck && npm run lint && npm test    # expect 87 passing as of WP2
node C:/Users/JAKE/.claude/skills/impeccable/scripts/detect.mjs --json <changed files>
graphify update .                                 # repo rule, after any code change
```

### Running the dev server

A **new file in `app/` 404s until the server restarts** — the route manifest is
built at boot. That is not a bug in your code, and it is the single most likely
thing to send you debugging a screen that is fine.

Restarting means killing what is already there first. Interrupting `expo start`
in a terminal frequently leaves the process alive, and each new run silently
takes the next port — this repo had accumulated five servers on 8081–8085, so
the tab you refresh may be served by a build from an hour ago.

```powershell
# kill every expo/metro process, then verify none survived
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'expo' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

```bash
npx expo start --web --port 8081 --clear
# then confirm the routes, rather than trusting the banner:
for r in / /author /upload /courses /missions /record /system /tree/demo; do
  curl -s -o /dev/null -w "%{http_code} $r\n" "http://localhost:8081$r"; done
```

`WARN props.pointerEvents is deprecated` on every prerendered route is
pre-existing library noise, not yours.

---

## 3. Work packages

Each is sized for one agent. "Blocked by" is the only ordering constraint;
everything else runs in parallel.

### ~~WP1 — Syllabus authoring (manual path)~~ — **done**

`app/author.tsx`. Node form (title, description, kind, XP 1–2000, prerequisite
multi-select), node list with edit and delete, a "Fix these first" window listing
every `validateGraph` error against the node title, and publish gated on
`isValid`. Draft is autosaved through `createStore` so a phone interruption does
not lose it. Reached from `/upload`; it is a bare route (no nav bar).

Two things a later package needs to know:

- **Ids.** Drafts carry a `slugId`, not a uuid. Publish inserts the nodes, reads
  back `id, sort_order`, and maps draft id → uuid by `sort_order`. Deleting a
  node cascades into the other drafts' `prereqIds`.
- **Publish needs a session.** `courses.owner_id` is `not null` with no default,
  so publish calls `supabase.auth.getUser()` first and says plainly that sign-in
  is not wired rather than throwing a Postgres error. This is the one place the
  auth decision (§6.3) is visible to a user.

### ~~WP2 — Quest naming~~ — **done**

- `src/features/skilltree/naming.ts` — `resolveName`, `resolveQuestName`,
  `normaliseOverride`, `MAX_NAME`. Precedence `override → generated → syllabus`,
  returning the text and its source. 10 tests.
- `src/lib/questNames.ts` — device overrides through `createStore`, one map per
  course. Local override beats `node.titleOverride` because auth is not wired, so
  the column cannot be written and showing it would undo what was just typed.
- `app/tree/[courseId].tsx` — the chart, detail window, REQUIRES list and "what
  next" bar all read one resolved name. Source shown as a word
  (`RENAMED BY HAND` / `GENERATED NAME` / `SYLLABUS TITLE`), inline rename form
  capped at `MAX_NAME`, and a revert labelled for whichever name it falls back
  to.
- `queries.ts` reads `quest_title`, `quest_subtitle`, `title_override`;
  `SkillNode` gained `questTitle` and `questSubtitle`.
- `/author` invokes `name-quest` for real after a publish, chunked at 40 to match
  the function's `MAX_BATCH`, and reports the count or the error.

**Not built:** achievement naming. `achievement_title` /
`achievement_description` are written by `name-quest` but nothing reads them —
`achievements.ts` derives its own six stamps. Wire it when a stamp should carry
a per-node name, and note the frontend's `achievementTitleOverride` has no
column behind it.

### ~~WP3 — Extra practice (help subtrees)~~ — **done**

The offer box, the confirm step and the graft all live in the chart detail
window. `adaptive.ts` is no longer unused — `shouldOfferHelp` drives the offer,
`rankNextQuests` picks the next node, and `learnerMode`/`paceTarget`/
`personalXpPerLevel` are on `/record`.

**This package found and fixed a live XP faucet. Read this before touching the
help path.**

`suggest-subtree` re-priced a node's `xp_reward` when a subtree was grafted, but
never its missions — and a student's XP comes from completed missions. Finish the
scaffold *and* the untouched original missions and you banked ~140% of what the
node was worth. Three things now stop that:

- `planFragmentation` (`missions.ts`, 7 tests) picks the split: missions present
  re-prices the missions, no missions re-prices the node column. It also keeps
  `xp_reward` equal to the mission sum, because the column is a cache of it.
- `suggest-subtree/index.ts` calls it and passes the new mission prices to the
  RPC. (Copied, not imported — Deno cannot reach the app's tsconfig, same as the
  existing `fragmentXp` copy. Change one, change both in the same commit.)
- **`0004_help_reprices_missions.sql`** drops the five-argument
  `request_help_subtree` and recreates it with `p_missions`. It re-checks
  conservation against the missions, rejects a partial re-pricing, and rejects a
  mission that does not belong to the node — the same reason its edges are
  checked. **Never applied; see §6.2.**

Other things a later package needs:

- **Signals.** `src/lib/signals.ts` records time-with-node-open and repeat
  visits; `observed.ts` (7 tests) converts them. Read its header before trusting
  a field: `attempts` means *times opened*, and `hintsUsed` is **always 0**
  because there is no hint feature. That caps `struggleScore` at 0.80, still well
  over the 0.55 threshold.
- **`recommendedId` is now a prop on `SkillTree`.** The screen ranks with
  `rankNextQuests` and the chart used to rank with `nextQuests`; passing it keeps
  the outlined node and the bar under it agreeing. `undefined` means "you pick",
  `null` means "nothing".
- **Supplemental nodes** render with an inverted bevel — a well, not a key — so
  no seventeenth colour was needed, and the a11y label leads with "Extra
  practice".
- **Requires a session,** like `/author`. Without one it says so and sends
  nothing.

### ~~WP4 — Profile~~ — **done**

`app/profile.tsx`, reached from `/system`. Read-only until "Edit profile",
per-field errors that appear on save and clear as you correct them, success
state. Stored at `cardinal.profile.v1` through `createStore`.

- **The type conflict is resolved.** `StudentProfile` in `types.ts` won, and
  `yearLevel` is a **string** — a foundation year, a placement year and "5+" are
  all real answers a number cannot hold. `UserProfile` is not ported.
- Only `fullName`, `email` and `studentNumber` are required. A required field
  someone does not want to answer is a form they abandon.
- `profile.ts` (9 tests) holds the rules. Its email check is deliberately not the
  RFC — three checks that catch what a student mistypes. The authority on whether
  an address works is a mail server, and it is not being asked.
- `profiles` exists in `0001_init.sql` with an owner-only policy, so this is the
  offline half of a real table. It moves when there is a session.

### ~~WP5 — Settings~~ — **done**

`app/system.tsx` now links to Profile, Instructor and Companion beside the
existing theme, motion, low-bandwidth and clear-record controls. The companion
row states in its own detail line that its answers are canned, so the label tells
the truth before the tap does.

Nothing else was added. The prototype shipped three toggles with no setter and
two dead buttons; padding this screen would have reproduced exactly that.

### ~~WP6 — Instructor view (marked prototype)~~ — **done**

`app/instructor.tsx` calls the two real RPCs — `course_cohort_summary` and
`course_mission_summary` — and renders a cohort readout plus per-node completion
counts. `src/features/skilltree/cohort.ts` + `cohort.test.ts` were **ported, not
rewritten**, from `frontend/lib/`, with 8 tests now actually run by `npm test`
(they never were in `frontend/`). `AnalyticsStudent` was moved into `cohort.ts`
rather than into `types.ts`.

**The privacy boundary held and must keep holding.** Aggregates only, suppressed
below five, never a named student. `mission_progress` and `node_progress` still
have no instructor policy, and that is deliberate. Two details worth keeping:

- The session is checked **before** the RPCs. A security-definer function keyed
  on `auth.uid()` cannot tell "not signed in" from "not the owner" from "too few
  students" — all three return zero rows — so asking first is what keeps the
  suppressed message honest about the case it names.
- Suppression renders as "not enough students yet", never as "0 students".

**The preview gate — read before assuming it is a login.** `admin` / `1234`
unlocks a **sample** cohort so the layout can be looked at. It is not
authentication and must never be described as any:

- The credentials are literals in the app bundle, readable by anyone who installs
  it. They keep nobody out and are not trying to.
- It cannot leak anything. The real figures come from ownership-gated
  security-definer functions; unlocking changes neither, and everything shown
  behind it is the `PREVIEW_READOUT` constant rather than a database row.
- It is labelled on screen in three places: the gate says "There is no login
  here", the unlocked notice reads `PREVIEW · SAMPLE FIGURES`, and a closing
  window explains that a sixth node with three completions is deliberately
  absent — the sample is built to *demonstrate* the suppression floor rather than
  just fill the layout.
- **Delete it when real auth lands.** It is scaffolding.

`frontend/components/instructor-app.tsx` was deliberately **not** ported — it is
a Next.js/shadcn surface. `frontend/lib/cohort.ts` and its test still exist on
disk; removing them belongs to the `frontend/` deletion step in §7, not here.

### ~~WP8 — AI Companion (marked prototype)~~ — **done**

`app/companion.tsx`: context bar naming the node it was opened from, quick
prompts, message log, composer. Reachable from `/system` with no node, and from
the chart's detail window with one (`/companion?courseId=…&nodeId=…`) — that
second entry point is what the screen was built for.

**How it avoids the prototype's central lie.** The old companion ran keyword
`if/else` over strings and displayed a shield saying it "does not complete graded
work for you" — a guardrail that never ran, bypassed by rephrasing. None of that
is ported. Instead:

- A persistent banner: *"Every reply below is canned, not generated. Nothing you
  type is read, saved, or sent anywhere."*
- Every companion bubble is tagged `CANNED REPLY` at the point of reading, not
  once at the top.
- Freeform input returns one fixed reply with **no keyword matching of any kind**,
  so there is no pattern to mistake for understanding.
- Quick prompts only restate data already fetched for the context bar — the
  node's own description, a real mission count — or state a plain limit.

No AI provider is called and none should be from here: `ANTHROPIC_API_KEY` must
never reach the bundle. If it is ever wired, it goes in `supabase/functions/`,
load the `claude-api` skill first, model stays `claude-opus-5`, and check
`stop_reason === 'refusal'` before reading content.

### ~~WP7 — Welcome~~ — **done**

Folded into `app/index.tsx` rather than a new `welcome.tsx`, since that file was
already the boot screen. One primary action into the demo chart; no sign-in
button, because auth is out of scope and a button leading nowhere is rule 9.

The BOOT log was kept deliberately: each of its lines is true the instant it is
shown, which is a different thing from the prototype's 1200ms timer pretending to
parse a syllabus. `/courses` was dropped as a second action — its policy reads
empty for every signed-out visitor — but it stays one tap away on the nav bar.

### ~~WP9 — Web fidelity~~ — **done**

- **Per-route `<Head>`** on every screen, each with a real title and description.
  `app/_layout.tsx` still holds the default that a screen without one falls back
  to.
- **Desktop layout.** `src/lib/layout.ts` owns the one breakpoint: `useWide()`
  at `WIDE_AT = 720`, plus `DOCK_WIDTH`. It reads `useWindowDimensions`, **not a
  CSS media query** — a media query would work on web and silently do nothing on
  iOS and Android, which is the same rule as everywhere else in this repo.
  - The chart puts its detail window in its own column beside the graph rather
    than over it, and gives the window more scroll height there.
  - Every other screen caps its column at 560 and now **centres** it. They were
    pinned to the left edge of a 1920px window, which was the actual "stretched
    phone" symptom.
- **Hover** via `hoverFill(theme, tone, hovered)` in `pixel.tsx`. React Native's
  own types do not declare `hovered`, so the cast lives once in the exported
  `PressState` type rather than at every call site. It is simply absent on
  native, where there is no pointer — that is correct, not a gap. The move is the
  one the grammar already owns: the fill becomes the tone's lit shade. No new
  colour, no shadow, no transition.

### ~~WP10 — Icons and splash~~ — **done**

`assets/` now exists and `app.json` references all four files.

**They are drawn, not exported.** `scripts/make-icons.mjs` authors the mark as a
16×16 bitmap in the locked palette and scales it by whole numbers only, writing
PNGs with `node:zlib` and about sixty lines of container. Re-run it with
`node scripts/make-icons.mjs` after editing the bitmap.

Why that rather than a design tool: every icon in this product is a bitmap on a
grid, and an antialiased icon would be the one image that disagrees with the
whole interface — visibly so at 48px. Whole-number scaling is what keeps every
output pixel exactly one palette entry.

- `icon.png` 1024² — full bleed on `void`.
- `adaptive-icon.png` 1024² — **transparent**, mark at 46% so it survives
  Android's launcher masking; the ground is `adaptiveIcon.backgroundColor`.
- `splash.png` 1024² — **transparent**, because the splash has two grounds
  (cream in light, void in dark). Baking either in would show a hard square of
  the wrong colour on the other.
- `favicon.png` 64².

The mark is the product: one node branching into two, one cleared. A monogram
would have been easier and would have said nothing.

---

## 4. Running these in parallel

**Conflict rule:** these files are shared. One agent owns each, or serialise
edits to them:

- `src/theme/tokens.ts` — should not need changes. If one does, it is a design
  decision; check `DESIGN.md` first.
- `src/ui/pixel.tsx`, `src/ui/NavBar.tsx` — new shared components and nav cells.
- `src/features/skilltree/types.ts` — WP4 adds a profile type. WP2 added
  `questTitle` / `questSubtitle` to `SkillNode`.
- `app/_layout.tsx` — WP9, and `BARE_ROUTES` (any new full-bleed screen with no
  nav bar adds itself to that array).
- `app/tree/[courseId].tsx` — **the contested one.** It is the hero screen and
  three packages want it: WP2 put the naming block in the detail window, WP3
  grafts the help offer onto the same window, WP9 docks that window to the right
  on desktop. Do not run two of those at once.
- `src/features/skilltree/queries.ts` — every package that needs a new column
  widens the same `select`.

**Suggested waves:**

All ten packages are done, so the wave table below is kept only as a record of
how they were run — four agents in parallel with strict file ownership, then the
cross-cutting work once the screens were still.

| Wave | Packages | Notes |
|---|---|---|
| 1 | ~~WP1, WP2, WP3, WP4~~ | All done |
| 2 | ~~WP5, WP6, WP7, WP8~~ | Four agents in parallel, one file owner each |
| 3 | ~~WP9, WP10~~ | WP9 touched every screen, so it ran last |

**What made the parallel wave safe, if it is ever repeated:** every agent was
given one owned file and an explicit off-limits list, and shared files
(`_layout.tsx`, `src/ui/**`, `src/theme/**`, `queries.ts`, `types.ts`) were owned
by nobody. Two agents flagged a needed edit outside their scope instead of making
it — the companion's entry point from the chart, and deleting `frontend/lib/`.
Both were right to stop.

WP1–WP4 between them touched `app/tree/[courseId].tsx`, `app/record.tsx`,
`app/system.tsx`, `app/upload.tsx`, `app/_layout.tsx` (`BARE_ROUTES`),
`SkillTree.tsx`, `queries.ts`, `missions.ts` and `types.ts`. Rebase before
starting anything in wave 2.

**A concurrent session migrated the whole app to light/dark themes** on
2026-08-05, after WP1/WP2 and during WP3. If you are reading old code samples,
they are stale: colours now come from `useTheme()` (`src/theme/useTheme.ts`), not
from `palette` directly, and `bevelStyle` takes the theme as its **first**
argument. Tones were renamed `cardinal → brand` and `brass → earned`;
`nodeStyle[status]` is now `theme.node[status]`. `palette` is still the raw
sixteen and is only read by `tokens.ts` itself.

Give every agent §2 verbatim in its prompt, plus the graphify rule. Have each one
report the files it changed so the next wave knows what moved.

---

## 5. Traps found in the audit

`frontend/` is a **mock prototype with no backend**. Do not port these:

- **Syllabus parse is theatre.** A 1200ms timer then loads a static fixture; the
  uploaded file's bytes are never read. `onPublishSyllabus()` takes no arguments
  and hardcodes three node ids as mastered, discarding the draft.
- **Auth cannot fail.** Prefilled credentials, submit routes to the dashboard.
- **Companion has no endpoint.** Keyword `if/else` over strings.
- **Achievements are four fixture rows** with hand-set unlock dates.
  `src/features/skilltree/achievements.ts` already derives six live. Root wins.
- **The streak is frozen at `9`.** Its setter is never called. `streakDays()` in
  `achievements.ts` computes it for real.
- **Universal tracks** are four hardcoded percentages with dead buttons.
- **Three of four settings toggles have no setter.** Sign-out and delete-account
  have no handler.
- **Instructor** is a static five-student fixture with two dead buttons.
- **Routing is `useState`,** not URL-backed — no deep links, refresh resets to
  welcome. Expo Router already beats this.

What is genuinely worth taking is listed in the work packages above. Everything
else in that directory is a shell.

---

## 6. Open decisions

1. **Instructor visibility.** Aggregates are built and the invariant is intact.
   If a named student's progress should be visible to their instructor, that is
   one policy on `mission_progress` plus a documented reversal in `AGENTS.md` and
   `PRODUCT.md`. It is lawful in most LMS contexts; it is still a decision, and
   it should be its own change.
2. **`0003_missions.sql` and `0004_help_reprices_missions.sql` have never been
   applied.** `supabase start` has not run in this repo, so neither has been
   executed against a real Postgres. 0004 is the higher risk of the two: it drops
   and recreates `request_help_subtree`, and its conservation arithmetic is the
   thing standing between a help request and minted XP. **Run `supabase db reset`
   and exercise a help request on a node with missions before trusting it.** The
   pure half of that rule is tested (`planFragmentation`, 7 tests); the SQL half
   is not.
3. **Auth.** Out of scope by decision, and now the single biggest thing standing
   between this build and a real one. Three screens stop at an honest "sign-in is
   not wired" wall: `/author`'s publish, the chart's extra-practice request, and
   `/instructor`'s real figures. **Wiring it also means deleting the instructor
   preview gate** (§3, WP6) — that gate exists only because there is no session,
   and leaving a hardcoded `admin`/`1234` in a build that has real accounts would
   turn a labelled piece of scaffolding into something that looks like a back
   door. Every screen currently works on the local
   record. Wiring auth makes each screen's data path conditional on a session,
   and turns three local stores into offline queues that need a push:
   `progress.ts` → `node_progress`, its mission log → `mission_progress`,
   `questNames.ts` → `skill_nodes.title_override`. None of them should be
   deleted when auth lands — a student on a metered connection between classes
   is who this product is for. `/author`'s publish is the one screen that
   already asks for a session and says so.
4. **Chart pan/zoom — built, with one gap.** The chart is now an unbounded
   canvas: `chartViewport.ts` (10 tests) owns the camera, `SkillTree.tsx` drives
   it with core `PanResponder`, and `ChartTools` exposes movable-nodes, zoom and
   fit.
   - **`PanResponder`, not `react-native-gesture-handler`.** Both it and
     `reanimated` are in `package.json` but neither is wired — there is no
     `babel.config.js` and no `GestureHandlerRootView`, and reanimated 4 needs a
     worklets plugin. `PanResponder` is core, needs no configuration, and works
     on web. Revisit if a gesture ever needs to run off the JS thread.
   - **Still no pinch.** Zoom is buttons only. Pinch needs two-pointer handling
     that `PanResponder` does poorly; that is the case for wiring
     gesture-handler properly.
   - Nodes are `Pressable` views now, not `<G>` elements. This **fixed a real
     accessibility hole**: a role'd element inside `<svg>` gets rewritten by
     react-native-web into a tag the browser drops, so chart nodes were
     announced but unreachable by keyboard. They are focusable now.
   - Dragged positions are **local only** (`cardinal.layout.v1.<courseId>`).
     `skill_nodes.x/y` is owner-writable by 0002, so a student rearranging a
     chart is a personal view of it, not an edit. An instructor editing the real
     layout is a separate feature.
5. **`PRODUCT.md` says `## Platform: web`** but this is a react-native + expo
   codebase, so the iOS and Android design guidance never loads. It probably
   wants to be `adaptive`.
6. **LMS integration is planned; LTI launch is parked.** Decided 2026-08-05:
   there is no LMS partner yet, so nothing LTI-specific gets built now. What it
   will need when it starts, so today's work does not block it:
   - **Launch is a session, not a screen.** An LTI launch POSTs a signed JWT and
     expects a session out of it. That lands on the auth decision (§6.3), not on
     any work package here.
   - **It does not reopen the one-codebase decision.** Expo web can be iframed;
     an LTI launch route is a route. The reason to reach for Next.js would be
     server-side launch validation, and that belongs in an Edge Function anyway,
     same as `ANTHROPIC_API_KEY`.
   - **Roster sync will want a real `enrollments` write path.** `0001_init.sql`
     has the table and a read policy; there is no insert path yet. Whoever wires
     it keeps the aggregate-suppression invariant (§6.1) intact — a roster makes
     per-student identification easier, not more permissible.
   - **`node_progress.verified_by` already has an `'lms'` value** in its check
     constraint. It is unused today and is the seam grade passback would write.

---

## 7. When `frontend/` can be deleted

All true:

- [x] WP1 (authoring), WP2 (quest naming), WP3 (help subtrees), WP4 (profile)
- [ ] WP5–WP8 shipped and verified
- [ ] `frontend/lib/cohort.ts` + `cohort.test.ts` ported into `src/` by WP6, or
      deliberately dropped — its suppression rule is correct and worth keeping
- [ ] Nothing in `src/` or `app/` imports from `frontend/`
- [ ] `frontend/lib/help-subtree.test.ts` either ported into `src/` or confirmed
      redundant — it is **not** run by `npm test` today (the glob is
      `src/**/*.test.ts`), so it is currently unenforced either way
- [ ] The six mock datasets in `frontend/lib/cardinal-repository.ts` are either
      ported as test fixtures or deliberately dropped — two of them are
      *deliberately invalid* graphs (a dangling prerequisite and a cycle) and are
      genuinely useful for exercising `validateGraph`
- [ ] `frontend/tsconfig.json`'s `@shared/*` alias into `../src/features/skilltree`
      is gone, along with the root `tsconfig.json` reference to `frontend`
