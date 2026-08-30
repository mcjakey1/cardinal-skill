# CLAUDE.md

**Read [AGENTS.md](./AGENTS.md) first.** It holds the stack, layout, commands,
invariants, and conventions for this repository, and it applies to you in full.
This file adds only what is specific to Claude Code.

## Navigating this codebase

If `graphify-out/graph.json` exists, answer codebase questions with the graph
before grepping:

```bash
graphify query "<question>"          # scoped subgraph for a question
graphify path "<A>" "<B>"            # how two things relate
graphify explain "<concept>"         # focused concept
graphify update .                    # after changing code (AST only, no API cost)
```

Use `graphify-out/wiki/index.md` for broad navigation and
`graphify-out/GRAPH_REPORT.md` only for architecture review. If the graph does
not exist yet, read `AGENTS.md` → Layout and go straight to the file.

Start points by task:

| Task | Start here |
| --- | --- |
| Unlock rules, XP, levelling | `src/features/skilltree/progression.ts` |
| How the chart renders | `src/features/skilltree/SkillTree.tsx` |
| Colour, type, spacing, motion | `src/theme/tokens.ts` + `DESIGN.md` |
| The instructor workspace | `app/instructor.tsx` + `DESIGN.md` |
| Who can read what | `supabase/migrations/0001_init.sql` |
| Syllabus → tree | `supabase/functions/parse-syllabus/index.ts` |

## Working with the AI providers in this repo

No code here calls Claude or the Anthropic SDK. There are two providers, both
reached only from `supabase/functions/`:

| Provider | Wrapper | Used by |
| --- | --- | --- |
| Google Gemini (`gemini-3.1-flash-lite`) | `_shared/gemini.ts` | `parse-syllabus` |
| b.ai | `_shared/bai.ts` | `study-companion`, `suggest-subtree` |

The model ids live at the top of each wrapper. Swapping one for something
cheaper is a product decision, not a code cleanup.

The rules that actually apply:

- **Authorize before you spend.** The pipeline costs real money and takes
  minutes. Check ownership *before* the first provider call, not after — RLS
  makes a course readable to everyone enrolled, so a readable course is not an
  owned one. `parse-syllabus` scopes on `owner_id` and returns 403.
- **A refusal is an HTTP 200.** Gemini signals one with `finishReason` (e.g.
  `SAFETY`) or `promptFeedback.blockReason` and no text. Check those *before*
  reading the candidate's content, or an empty-parts refusal looks like an empty
  response. Status matters downstream: 422 is final, 502 is retried at full
  price by `parse-syllabus`.
- **Structured output, not prompt-and-hope.** Gemini requests set
  `generationConfig.responseJsonSchema` with
  `responseMimeType: 'application/json'`. The 400 fallbacks are gated on the
  provider naming the field it rejected — an unrelated 400 must surface rather
  than silently re-running the call without its schema.
- **Never `JSON.parse` provider text directly.** Use `parseJsonObjectText`
  (`_shared/bai.ts`). Fallback paths put the schema in the prompt and routinely
  return ```json-fenced output that a raw parse rejects — after you have paid.
- **Bound every client-supplied string that reaches a system prompt.** Item and
  length caps, on the RLS path as well as the demo path. An unbounded field is
  both unbounded token spend and prompt injection into the system channel.
- **AI output is untrusted.** Parser graphs go through
  `_shared/courseGraph.ts` (`normalizeTieredCourseDag` repairs cycles, orphans,
  dangling refs, and disconnection) before anything is persisted.
- **Every call carries an explicit timeout** so it stays under the Edge Function
  HTTP timeout; see `fetchWithTimeout` in `_shared/gemini.ts`.

## Skills to reach for

- `frontend-design` — before adding or reshaping UI. `DESIGN.md` is the brief;
  read it rather than inventing a second visual direction.
- `graphify` — codebase questions, once the graph is built.
- `superpowers:systematic-debugging` — a failing test or wrong behaviour, before
  proposing a fix.

## Two things that are easy to get wrong here

**The Edge Function is not the app.** `supabase/functions/` runs on Deno, imports
with `npm:` specifiers, and is excluded from the app's `tsconfig.json`. Editor
errors there about missing types are expected; run `supabase functions serve` to
check it, not `tsc`.

**Changing a token changes every screen.** `src/theme/tokens.ts` is the single
source of colour, type, and spacing. Adjusting a value is a design decision —
check it against `DESIGN.md` and the contrast requirements before shipping it.

**There are two designs here, and mixing them is the mistake.** `/instructor` is
a conventional LMS workspace on purpose, with its own tokens in
`src/theme/lms.ts` and its own parts in `src/ui/lms.tsx`; its brief is
the instructor section of `DESIGN.md`. The one crossing is deliberate: the
authoring canvas inside it draws in the student's tokens, because an instructor
needs to see the artifact as it is delivered.
