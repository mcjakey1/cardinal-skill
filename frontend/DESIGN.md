---
name: Cardinal Skill — Instructor Workspace
description: A conventional LMS workspace, played straight, wrapped around a chart drawn in the student's own grammar.
colors:
  ground: "#f7f3ea"
  surface: "#fffdf8"
  surfaceSunk: "#efe6d8"
  surfaceHover: "#f4efe4"
  ink: "#251f20"
  inkMuted: "#645b5d"
  brand: "#981e2f"
  brandInk: "#fffdf8"
  brandWash: "#f6eae9"
  brandHover: "#7f1826"
  gold: "#d2a33a"
  goldInk: "#8a6a1f"
  goldWash: "#f7efdc"
  ok: "#1f6b4a"
  okWash: "#e6f0ea"
  attention: "#8a5a12"
  attentionWash: "#f7efe0"
  attentionLine: "#e2cfa8"
  errorLine: "#e8c9c9"
  line: "#ded4c4"
  lineStrong: "#8f8270"
typography:
  page:
    fontFamily: "DM Sans"
    fontSize: "24px"
    lineHeight: "32px"
    fontWeight: "600"
    letterSpacing: "-0.01em"
  section:
    fontFamily: "DM Sans"
    fontSize: "16px"
    lineHeight: "24px"
    fontWeight: "600"
  body:
    fontFamily: "DM Sans"
    fontSize: "14px"
    lineHeight: "20px"
  small:
    fontFamily: "DM Sans"
    fontSize: "13px"
    lineHeight: "18px"
  micro:
    fontFamily: "DM Sans"
    fontSize: "12px"
    lineHeight: "16px"
    letterSpacing: "0.04em"
    fontWeight: "600"
rounded:
  xs: "3px"
  sm: "5px"
  md: "8px"
  pill: "11px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  btn:
    height: "34px"
    padding: "0 13px"
    rounded: "5px"
    border: "1px solid {colors.lineStrong}"
    backgroundColor: "{colors.surface}"
    boxShadow: "0 1px 2px rgba(37,31,32,.06), 0 1px 3px rgba(37,31,32,.05)"
  btn-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brandInk}"
  input:
    minHeight: "34px"
    padding: "7px 10px"
    rounded: "5px"
    border: "1px solid {colors.lineStrong}"
    boxShadow: "inset 0 1px 2px rgba(37,31,32,.04)"
  panel:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.line}"
    rounded: "8px"
    boxShadow: "0 1px 2px rgba(37,31,32,.06), 0 1px 3px rgba(37,31,32,.05)"
  table-header:
    backgroundColor: "{colors.surfaceSunk}"
    typography: "{typography.micro}"
    textColor: "{colors.inkMuted}"
  badge:
    height: "21px"
    padding: "0 8px"
    rounded: "11px"
    fontSize: "12px"
---

# Design System: Cardinal Skill Instructor Workspace

## Overview

**Creative north star: the category standard, played straight.**

This is the deliberately conventional half of Cardinal Skill. The student app
refuses the ed-tech dashboard as a matter of position; this surface adopts it as
a matter of service. Its reader is an instructor who already spends their week in
Canvas or Classroom, at a desk, on a laptop, doing bulk work — and who should not
have to learn a second interface to publish a syllabus.

The craft bar is **Google Classroom and the Stripe Dashboard** for finish and
restraint, **Canvas and Brightspace** for structural familiarity. Convention here
means matching their level of execution, not borrowing their least considered
habits.

**The one thing that is not conventional**, and the reason this surface is not
interchangeable with any other LMS: the authoring canvas draws the course tree in
the *student's* sixteen-colour grammar, at the student's geometry, using the
student's tokens. An instructor authoring an artifact sees the artifact as
delivered.

**Deliberately not used:** stat-card hero rows; progress rings; same-size
icon-heading-text cards as page structure; eyebrow or kicker labels; nested
cards; zero-offset colour halos; monospace as a "technical" costume.

## Colors

A warm institutional ground with one deep brand red and a narrow signal set.
Every value below was measured against the ground it sits on before it shipped.

### Ground and surface
- **ground** `#f7f3ea` — the page.
- **surface** `#fffdf8` — panels, tables, the rail, the topbar.
- **surfaceSunk** `#efe6d8` — table headers, segmented-control troughs, avatars.
- **surfaceHover** `#f4efe4` — row and control hover.

### Ink
- **ink** `#251f20` — 14.64:1 on ground. All primary text.
- **inkMuted** `#645b5d` — 5.93:1 on ground, 5.31:1 on surface. Secondary text,
  table headers, hints. Chosen over the original `#71686a`, which measured 4.36:1
  on `surfaceSunk` and so failed AA in exactly the place table headers live.

### Brand
- **brand** `#981e2f` — 7.40:1 on ground. Primary buttons, active nav, links,
  meter fill, destructive emphasis.
- **brandInk** `#fffdf8` — 8.06:1 on brand.
- **brandWash** `#f6eae9` — selected rows and active nav ground.

### Signal
- **ok** `#1f6b4a` (5.82:1) — on track, valid. Ground: **okWash** `#e6f0ea`.
- **attention** `#8a5a12` (5.34:1) — needs support, suppression notice, low meter.
  Ground: **attentionWash** `#f7efe0`, edge **attentionLine** `#e2cfa8`.
- **errorLine** `#e8c9c9` — the edge on a validation-failure notice, over
  `brandWash`.
- **gold** `#d2a33a` — **fill only.** It measures 2.29:1 on surface and must never
  set text; **goldInk** `#8a6a1f` (4.56:1) is the ink for gold-toned content, over
  **goldWash** `#f7efdc`.

### Lines
- **line** `#ded4c4` — decorative hairline at 1.32:1. Dividers and panel edges.
- **lineStrong** `#8f8270` — 3.39:1 on ground. Every boundary a user must
  actually see: input borders, button borders, control edges.

### Named rules

**The Gold-Is-Not-Ink Rule.** `gold` fills chips and marks. The moment it sets
text the screen fails contrast. Use `goldInk`.

**The Two-Line Rule.** `line` divides; `lineStrong` bounds. If a user has to find
the edge of a control, it is `lineStrong` or it is a control they cannot find.

## Typography

**One face: DM Sans.** An Operate surface is well served by a workhorse UI face,
and a second family here would be a second design for no gain. The student app's
DotGothic16 is loaded on this surface for exactly one consumer — the authoring
canvas — and appears nowhere in the chrome.

- **page** 24/32, 600, -0.01em — one per screen.
- **section** 16/24, 600 — panel and group headings.
- **body** 14/20 — the default, and the size Stripe-class data tools read at.
- **small** 13/18 — table cells, controls, inspector values.
- **micro** 12/16, 600, +0.04em, uppercase — column headers, labels, legends.

Prose caps at **68ch**. Tables and the canvas deliberately do not cap; a roster
that wraps to a measure is a roster nobody can scan.

Numbers in tables use `font-variant-numeric: tabular-nums` so columns align.

## Layout

A **fixed 244px rail** plus a fluid main column. The rail carries brand, the
course switcher, section nav, and the account block; it is sticky full-height on
desktop and becomes an overlay drawer below 860px.

A **52px sticky topbar** carries a breadcrumb (Courses › COURSE › Section) and
the term chip. Page padding is 28px/32px, dropping to 16px on a phone.

The tree route runs **flush** — no page padding — because the canvas is a map and
padding shrinks the map.

Vertical rhythm: 4/8/12/16/24/32/48. A section heading gets **36px above and 12px
below**, so a heading always belongs to what follows it.

## Elevation & Depth

Three lifts, each with an offset *and* a blur. A zero-offset coloured halo is
decoration and is not used.

- **lift-1** `0 1px 2px rgba(37,31,32,.06), 0 1px 3px rgba(37,31,32,.05)` —
  panels, buttons, the active segmented cell.
- **lift-2** — raised surfaces (unused at rest; reserved for popovers).
- **lift-3** `0 4px 8px …, 0 12px 32px …` — modals and the mobile drawer.

Inputs invert it: `inset 0 1px 2px` reads as a well.

## Shapes

`3px` on hairline elements (a 6px meter track, a legend chip, a skeleton bar),
`5px` on controls, `8px` on panels, `11px` (pill) on badges. Nothing is square
and nothing is fully round — the student app owns radius 0, and echoing it here
would blur the line between the two surfaces.

The `3px` step exists because the alternatives were worse: at `5px` a 6px-tall
track rounds into a lozenge, and letting each small element pick its own value is
how a scale stops being one.

Icons are **lucide-react** at 15–17px, one library, one stroke weight. No emoji,
no mixed sets.

## Components

### Tables (the spine)
The primary structure of every screen. `surfaceSunk` header in micro caps,
11px/16px cells, 1px `line` row separators, `surfaceHover` on row hover, right
aligned numerics. `min-width: 620px` inside an `overflow-x: auto` wrapper, so a
phone scrolls the table rather than crushing it.

### Meter
A horizontal 6px track, not a ring. `brand` fill, `attention` below 30%, with the
percentage in tabular numerals beside it. A ring hides its own scale; a track
reads left to right like the number next to it.

### Badge
21px pill, 12px text, four tones: neutral, `ok`, `attention`, `brand`, `gold`.
Always paired with a word — never a bare colour.

### Segmented control
Filter and mode switches. `surfaceSunk` trough, `surface` active cell with
`lift-1`, `aria-pressed` on each button.

### Notice
A bordered block for state that is not a row: neutral, `attention` (suppression),
`error` (validation failure). Icon plus a bold lead line plus the recovery.

### Authoring canvas (signature)
The exception, and the reason this surface exists in this repo rather than any
LMS. Rendered from `src/theme/tokens.ts`, `src/theme/dither.ts` and
`src/features/skilltree/edgeRouting.ts` — the student app's own modules:

- 44px cells with 2px bevels lit top-left, dark bottom-right.
- Cardinal dithered into wine as the ground, band count scaled to canvas height
  so a band stays ~90px as it is on a phone.
- Orthogonal edges with square junction dots and drawn arrowheads.
- Two lines of 13px `bone` DotGothic16 beneath every mark.
- Two modes: **As students see it** (statuses derived from zero mastery through
  the shared rules) and **Structure** (coloured by difficulty band, with a named
  legend, because colour never carries meaning alone).

## States

Every screen ships loading, empty, and error. Loading is skeleton rows, not a
spinner, so the layout does not jump. Disabled controls drop their shadow and go
to 50%. Focus is a 2px `brand` ring at 2px offset.

## Motion

**One authored moment:** the canvas settles in — 4px rise, 280ms, exponential
ease-out — when a layout finishes computing. Everything else is instant, because
an instructor waiting on an animation to read a roster is an instructor being
made to wait. Colour transitions on hover run at 100–120ms.

Under `prefers-reduced-motion` the travel is removed — settle, modal rise, drawer
slide, skeleton pulse — while colour feedback on hover and selection is kept. A
blanket `animation: none` would take away the feedback along with the movement.

## Do's and Don'ts

### Do
- **Do** lead a screen with the table. It is the thing an instructor came for.
- **Do** pair every status colour with its word.
- **Do** use `lineStrong` for anything a user must see the edge of.
- **Do** state what the build cannot do, where it cannot do it. The import screen
  says the parser is not deployed rather than showing a progress bar that lies.
- **Do** keep the canvas in the student's grammar, exactly, including where that
  grammar is unflattering.

### Don't
- **Don't** set text in `gold`. Use `goldInk`.
- **Don't** open a screen with a row of big-number stat cards.
- **Don't** put an eyebrow above a heading.
- **Don't** nest a card in a card.
- **Don't** restyle the canvas toward this surface's palette. The moment it stops
  matching what ships, it stops being able to answer the only question it exists
  to answer.
