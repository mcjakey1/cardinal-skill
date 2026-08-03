# DESIGN.md

The visual and written direction for SkillQuest. `src/theme/tokens.ts` is the
machine-readable half of this document; if the two disagree, this file is the
intent and the tokens are wrong.

## The brief

A student carrying five courses opens the app between classes, on a phone, often
on a slow connection. They have one question: **what should I do next, and does it
matter?** Everything here serves that question.

Two failure modes to design against. Traditional course tools answer it with a
list of due dates, which shows urgency but never progress. Gamified education
tools answer it with confetti, which shows progress but implies the work was
trivial. The tone we want sits between: the student's effort is being recorded
seriously, and the record is worth looking at.

## The direction: a navigational chart

The product is named for cardinal directions, and a skill tree is literally a
graph you navigate. So the interface is a **celestial atlas** — a chart printed on
deep blue paper, with engraved hairlines, marginalia set in monospace, and a
single red line marking your bearing.

Why this and not the obvious alternatives:

- It gives progress a shape without cartoon reward language. Nothing bursts; the
  chart fills in.
- It is cheap to render and cheap to send. Flat fills and hairline strokes are
  SVG primitives, which matters for the low-bandwidth mode this product promises.
- It is culturally neutral. A chart reads the same everywhere the Cintana
  Alliance operates; a mascot or a medal does not.

**Deliberately not used:** cream background with a serif display face; near-black
with an acid-green accent; purple gradients; XP bars styled after mobile games;
trophy or badge iconography.

## Colour

| Token | Hex | Role |
| --- | --- | --- |
| `ink` | `#0B1622` | The chart ground. Navy, not black — the paper has a colour. |
| `inkRaised` | `#132234` | Cards, sheets, anything sitting above the chart. |
| `slate` | `#46596E` | Engraved hairlines, dividers, locked nodes. |
| `haze` | `#93A6BC` | Secondary text on ink. |
| `parchment` | `#EEF2F6` | Primary text on ink; surface colour in light mode. |
| `cardinal` | `#C4123F` | The accent. The meridian, the current objective, one primary action per screen. |
| `brass` | `#C8A15A` | Mastered nodes and walked edges. |

Two rules, both load-bearing:

**Cardinal is rationed.** It appears at most twice on a screen. The moment a
second thing is red, the student stops knowing where to look. If a new element
seems to need the accent, something else has to give it up.

**Colour never carries meaning alone.** Node status is encoded three ways at
once — colour, shape, and a text label read by screen readers:

| Status | Colour | Shape | Label |
| --- | --- | --- | --- |
| Locked | outline in `slate` | hexagon | "Locked" |
| Available | filled `cardinal` | circle | "Available" |
| Mastered | filled `brass` | square | "Mastered" |

`cardinal` and `brass` differ in hue *and* in lightness, so they stay distinct
under every common form of colour vision and in greyscale. Body text on `ink`
meets WCAG AA at 16px; anything below 16px uses `parchment`, not `haze`.

## Typography

| Role | Face | Used for |
| --- | --- | --- |
| Display | Archivo Expanded, 700 | Chart titles, screen headings. Never body copy. |
| Body | Public Sans, 400 / 500 | Everything a student reads in sentences. |
| Marginalia | IBM Plex Mono, 400 | XP counts, levels, terms, timestamps, node codes. |

The wide display face is the atlas title-block; the monospace is the numbers
printed in a chart's margin. Keeping quantities in mono means a number always
looks like a number, and the eye finds "340 XP" without reading the sentence
around it.

Scale is a 1.25 ratio rounded to whole pixels: 11 / 13 / 16 / 20 / 32. Eyebrow
labels are mono, uppercase, `letterSpacing: 1.6`. Nothing else is uppercase —
all-caps in body copy hurts legibility and breaks in languages that don't have
letter case.

Public Sans and IBM Plex Mono both ship wide Latin, Cyrillic, and Greek coverage,
which the Alliance's institutions need. Confirm glyph coverage before adding a
locale, not after.

## Layout

The chart is the screen, not a panel on it. Three zones:

```
┌──────────────────────────────────┐
│ LEVEL 4   ▓▓▓▓▓▓░░░░   340/900 XP│  meter — mono, one line, no chrome
├──────────────────────────────────┤
│                                  │
│         ◇────●                   │
│         │     ╲                  │  the chart — full bleed, the hero
│         ■──────◆ ← meridian      │
│                                  │
├──────────────────────────────────┤
│ ASSIGNMENT                       │
│ Regression diagnostics           │  detail sheet — appears on selection
│ You'll be able to read a resid…   │
│ 50 XP                            │
└──────────────────────────────────┘
```

The detail sheet is not a modal. It slides up alongside the chart so the student
never loses their place, and it is an `accessibilityLiveRegion` so a screen
reader announces the selection.

Breakpoints: below 720px the sheet is a bottom drawer; above, it docks to the
right and the chart keeps the remaining width. There is no third layout.

## The signature: the meridian

One element carries the identity. **The meridian** is a single `cardinal` line
drawn from the student's furthest mastered node to their recommended next node —
the answer to "what should I do next", rendered as a bearing across the chart.

It is the only red line on the screen. It is drawn last, over the hairlines. When
a node is mastered the meridian re-aims, and that re-aim is the app's one moment
of drama.

Everything else stays quiet so this reads. That is the whole design in one rule.

## Motion

Three animations exist. There is not a fourth.

| Moment | Treatment | Duration |
| --- | --- | --- |
| Node unlocks | its edge draws in, `stroke-dashoffset` | 400ms |
| Meridian re-aims | the line sweeps to its new target | 400ms |
| Press, sheet | opacity and translate | 160ms |

Easing is `cubic-bezier(0.2, 0, 0, 1)` throughout. All three are skipped entirely
under `prefers-reduced-motion`; the end state must be correct without them, which
means motion is never how information arrives.

## Writing

Copy is design material. The rules that matter most here:

**Name what the student controls.** "Chart", "node", "quest" are the student's
words because they are what's on screen. "Skill tree DAG", "syllabus parse job",
"prerequisite edge" are ours; they belong in code and in this document, not in the
interface.

**An action keeps its name through the flow.** The button says "Mark complete";
the confirmation says "Marked complete". Never "Submit".

**Empty states point at the next action.** "No charts yet — upload a syllabus and
one gets drawn for you." Not "You have no data."

**Errors say what happened and what to do.** "Couldn't load this chart. Try again
in a moment." Not "An error occurred" and not an apology.

**Never congratulate the student on trivia.** The reward for finishing a reading
is that the chart changed. There is no "Great job!".

Sentence case everywhere except mono eyebrows. Active voice. No exclamation marks.

## Accessibility floor

Non-negotiable, checked before a screen is considered done:

- Every interactive element has an `accessibilityLabel` and `accessibilityRole`.
  On the chart, the label carries title, status, and XP value in one sentence.
- Touch targets are at least 44×44pt, including chart nodes — the visible mark is
  smaller than its hit area.
- Text scales with the OS setting. No fixed-height container that clips at 200%.
- Full keyboard traversal on web, with a visible focus ring in `cardinal`.
- Reduce-motion respected, as above.
- A low-bandwidth mode that skips node illustrations and renders the chart in
  primitives only. The chart is designed so this mode loses nothing but polish.

## Extending this

Before adding a colour, a font, a motion, or a layout: check whether an existing
token does the job. If it genuinely doesn't, add it to `src/theme/tokens.ts`
*and* to this document in the same change, with a sentence saying what it is for.
A token with no entry here is a token nobody else will use correctly.
