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
| Who can read what | `supabase/migrations/0001_init.sql` |
| Syllabus → tree | `supabase/functions/parse-syllabus/index.ts` |

## Working with the Claude API in this repo

The syllabus parser calls Claude. When you touch it:

- The model is `claude-opus-5`. Do not swap it for a cheaper model to save cost —
  that is a product decision, not a code cleanup.
- Load the `claude-api` skill before editing `supabase/functions/parse-syllabus/`.
  Several API shapes changed recently and answering from memory produces code
  that returns a 400.
- The parser uses structured outputs (`output_config.format`) so the response is
  schema-valid JSON. Do not replace it with prompt-and-hope JSON parsing.
- Always check `stop_reason === 'refusal'` before reading `content`. A refusal is
  an HTTP 200 with empty or partial content.
- Requests with large `max_tokens` stream and call `.finalMessage()`, to stay
  under the HTTP timeout.

## Skills to reach for

- `claude-api` — before any change to the Edge Function or model configuration.
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
