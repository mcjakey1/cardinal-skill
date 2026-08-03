# SkillQuest

Upload a course syllabus. Get a skill tree you can navigate.

SkillQuest converts a standard syllabus into a prerequisite graph of learning
nodes. Finishing coursework unlocks nodes and earns XP, so a student can see
where they are in a course instead of reading a list of due dates.

Built for the 2026 Cintana Alliance Artificial Intelligence Challenge. One
codebase ships to **web, iOS, and Android**.

## Why

- **Fragmented visibility.** Students carrying five courses have no single view
  of what they have learned and what is next.
- **Syllabi list, they don't connect.** A schedule shows order. It never shows
  which topic depends on which.
- **Ed-tech is administrative.** Most tools optimise grading and scheduling and
  ignore motivation entirely.

## How it works

```
syllabus (PDF or text)
        │
        ▼
  parse-syllabus            Supabase Edge Function → Claude, structured output
        │                   Returns nodes + prerequisite edges, schema-validated
        ▼
  skill_nodes + node_prereqs        Postgres, row-level security per student
        │
        ▼
  the chart                 One SVG renderer for all three platforms
```

Two kinds of tree:

- **Course trees** — generated from one uploaded syllabus.
- **Universal tracks** — cross-disciplinary competencies (academic writing, data
  analysis) a student builds across semesters.

## Getting started

Requires Node 22+ and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
cp .env.example .env        # fill in your Supabase URL and anon key
supabase start              # local Postgres + auth
npm run db:reset            # apply migrations and RLS policies
npm start                   # then press w (web), i (iOS), or a (Android)
```

To run the syllabus parser locally you also need an Anthropic API key:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npm run fn:serve
```

## Checks

```bash
npm run typecheck
npm run lint
npm test
```

## Project docs

| File | What's in it |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | The working contract: stack, layout, invariants, conventions. Read this first. |
| [CLAUDE.md](./CLAUDE.md) | Claude Code specifics on top of `AGENTS.md`. |
| [DESIGN.md](./DESIGN.md) | Visual direction, tokens, accessibility floor, and how to write UI copy. |

## Privacy

Student metrics are personal records, and the schema treats them that way.
Row-level security scopes every progress row to its owner; instructor views
return class-level aggregates suppressed below five students, never a named
student's grades. Leaderboards and social visibility are opt-in and off by
default. Designed against FERPA from the schema up — see the policies in
`supabase/migrations/0001_init.sql`.

## Status

Prototype. The MVP is the syllabus-to-chart generator, the chart itself, and
manual progress verification. LMS sync, the AI study companion, the instructor
dashboard, and academic guilds are on the roadmap and deliberately not built yet.
