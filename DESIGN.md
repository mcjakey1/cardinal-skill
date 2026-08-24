---
name: Cardinal Skill
description: A course syllabus, drawn as a theme-bound pixel field that a student clears.
colors:
  cream: "#F5EFE3"
  indigo: "#4A3FB0"
  void: "#0A0407"
  abyss: "#16070E"
  oxblood: "#2A0A16"
  wine: "#4A0E20"
  blood: "#7E0A28"
  cardinal: "#C4123F"
  rose: "#E8506B"
  blush: "#FF9FB0"
  umber: "#3A2410"
  brass: "#C8A15A"
  gold: "#E8C87A"
  slate: "#5A4A55"
  haze: "#A794A0"
  bone: "#EDE7EA"
  white: "#FFFFFF"
  periwinkle: "#7A6BE8"
  obsidian-ground: "#0B0F19"
  obsidian-surface: "#111827"
  obsidian-raised: "#1E293B"
  obsidian-border: "#334155"
  obsidian-sky: "#38BDF8"
  obsidian-active: "#0284C7"
  obsidian-active-edge: "#E0F2FE"
  obsidian-locked-ink: "#64748B"
  obsidian-muted: "#94A3B8"
  obsidian-secondary: "#CBD5E1"
  obsidian-ink: "#F8FAFC"
  cyber-ground: "#100926"
  cyber-surface: "#190F38"
  cyber-raised: "#2B1055"
  cyber-border: "#3A2B68"
  cyber-locked: "#1E1638"
  cyber-locked-ink: "#6C599E"
  cyber-mint: "#00FFA3"
  cyber-pink: "#E00070"
  cyber-pink-edge: "#FF70BA"
  cyber-muted: "#B9A7D8"
  cyber-secondary: "#E9DDF7"
  cyber-ink: "#FFF8FC"
  emerald-ground: "#08140E"
  emerald-surface: "#0D2117"
  emerald-locked: "#0E2419"
  emerald-raised: "#133824"
  emerald-active: "#15803D"
  emerald-border: "#1B432E"
  emerald-completed: "#22C55E"
  emerald-locked-ink: "#3F6E54"
  emerald-active-edge: "#4ADE80"
  emerald-muted: "#86B89A"
  emerald-icon: "#86EFAC"
  emerald-secondary: "#BBF7D0"
  emerald-ink: "#F0FDF4"
  solar-ground: "#1C1917"
  solar-surface: "#292524"
  solar-hover: "#3A302C"
  solar-border: "#44403C"
  solar-completed-bg: "#451A03"
  solar-locked-ink: "#78716C"
  solar-active: "#EA580C"
  solar-completed: "#F59E0B"
  solar-muted: "#A8A29E"
  solar-secondary: "#E7E5E4"
  solar-active-edge: "#FDBA74"
  solar-icon: "#FDE68A"
  solar-ink: "#FAFAF9"
  nord-ground: "#2E3440"
  nord-surface: "#3B4252"
  nord-raised: "#434C5E"
  nord-border: "#4C566A"
  nord-active: "#5E81AC"
  nord-locked-ink: "#616E85"
  nord-active-edge: "#81A1C1"
  nord-completed: "#88C0D0"
  nord-muted: "#B8C1D1"
  nord-secondary: "#D8DEE9"
  nord-ink: "#ECEFF4"
typography:
  display:
    fontFamily: "DotGothic16_400Regular"
    fontSize: "44px"
    lineHeight: "52px"
  headline:
    fontFamily: "DotGothic16_400Regular"
    fontSize: "32px"
    lineHeight: "40px"
  title:
    fontFamily: "DotGothic16_400Regular"
    fontSize: "20px"
    lineHeight: "28px"
    letterSpacing: "0.5px"
  body:
    fontFamily: "DotGothic16_400Regular"
    fontSize: "16px"
    lineHeight: "24px"
  label:
    fontFamily: "DotGothic16_400Regular"
    fontSize: "16px"
    lineHeight: "24px"
    letterSpacing: "1px"
  micro:
    fontFamily: "DotGothic16_400Regular"
    fontSize: "12px"
    lineHeight: "16px"
    letterSpacing: "0.5px"
rounded:
  none: "0px"
spacing:
  hair: "2px"
  xs: "4px"
  cell: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.cardinal}"
    textColor: "{colors.bone}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.oxblood}"
    textColor: "{colors.bone}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "44px"
  button-disabled:
    backgroundColor: "{colors.oxblood}"
    textColor: "{colors.haze}"
  input:
    backgroundColor: "{colors.abyss}"
    textColor: "{colors.bone}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "8px"
    height: "44px"
  window-titlebar:
    backgroundColor: "{colors.cardinal}"
    textColor: "{colors.bone}"
    typography: "{typography.label}"
    padding: "4px 8px"
  window-body:
    backgroundColor: "{colors.abyss}"
    textColor: "{colors.bone}"
    typography: "{typography.body}"
    padding: "16px"
  nav-cell:
    backgroundColor: "{colors.oxblood}"
    textColor: "{colors.haze}"
    typography: "{typography.micro}"
    height: "44px"
  nav-cell-active:
    backgroundColor: "{colors.cardinal}"
    textColor: "{colors.bone}"
  node-available:
    backgroundColor: "{colors.cardinal}"
    textColor: "{colors.bone}"
    size: "44px"
  node-mastered:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.bone}"
    size: "44px"
  node-locked:
    backgroundColor: "{colors.oxblood}"
    textColor: "{colors.haze}"
    size: "44px"
---

# Design System: Cardinal Skill

## Overview

**Creative North Star: "The Theme-Bound Pixel Field"**

The interface is a Japanese personal-computer screen from the era when a machine
had a small hardware palette and one font in ROM, and the people working on it
treated those limits as the material rather than the obstacle. Regions are fixed
and never move. Depth is an edge, not a shadow. Each curated theme provides a
small semantic palette; intermediate texture is made by interleaving its colours
at the pixel level rather than introducing gradients.

That grammar was chosen because it does the product's job. A student between
classes needs to know what is open to them right now, and a screen built out of
lit cells answers that faster than a page of type: a cell is either lit or it is
not. It is also the cheapest an interface can be — flat fills, hard edges and
pattern tiles are very little data, which is what the low-bandwidth mode this
product promises actually needs.

The register is celebratory but never congratulatory. Progress is an event on
screen — the chart wipes open, a streak counts, a stamp lands — and none of it
praises the student for trivia or implies the work was easy.

**Scope: this document governs the single Expo app** on web, iOS and Android.
The student routes use the sixteen-colour screen grammar below. The instructor
route is a deliberately conventional LMS workspace with its own tokens in
`src/theme/lms.ts`; see the Brand Commitments section of PRODUCT.md. Both
surfaces share progression rules, chart tokens, ordered dither, and edge routing.

**Deliberately not used — in the student app:** the contemporary ed-tech
dashboard (light ground, rounded cards, a progress ring, a Continue row); cream
paper with a serif display face; smooth gradients of any kind; drop shadows;
emoji or icon-font glyphs.

That refusal is scoped, not universal. The instructor workspace ships the
ed-tech dashboard on purpose, because its reader arrives fluent in one. The one
place the student grammar crosses over is that workspace's authoring canvas,
which draws the tree exactly as delivered so an author can see what they ship.

**Key Characteristics:**
- Five curated dark palettes remap one semantic token contract.
- Obsidian Blueprint is the default; theme choice persists per device.
- Completed, available, and locked states keep their glyph and word when their
  colours change.
- One typeface for the entire interface.
- Square corners everywhere. Radius is zero.
- Fixed regions: marginalia, the chart, the docked window, the nav bar.
- Every status is said three ways: colour, drawn glyph, and word.

## Colors

Colour is semantic rather than screen-specific. Every preset supplies canvas,
surface, border, text, node-state, edge-state, HUD, navigation, and XP roles.
Components consume those roles through `useAppTheme()` and never choose a raw
palette colour based on the active preset ID.

### Legacy Cardinal palette

The Cardinal family below remains the visual ancestry of the product and is used
where a semantic preset maps to those values. It no longer defines every runtime
screen by itself.

### Primary
- **Cardinal** (`#C4123F`): the dominant colour of the product. It fills the
  chart field, the window title bar, the active navigation cell, the primary
  button, and any node open to the student right now. Not an accent used
  sparingly — the surface.
- **Blood** (`#7E0A28`): cardinal in shadow. The bottom-right bevel edge on a red
  surface, and the darker half of red dither pairs.
- **Rose** (`#E8506B`): cardinal lit. The top-left bevel edge on red, and the
  colour of an error line in a log window.
- **Blush** (`#FF9FB0`): the brightest red in the palette, reserved for exactly
  one thing — the outline on the recommended next node — plus the focus ring.

### Secondary
- **Brass** (`#C8A15A`): mastered. Cleared nodes, walked edges, earned stamps and
  the level meter. It differs from cardinal in hue *and* in value, so the two stay
  distinct in greyscale and under every common form of colour vision.
- **Gold** (`#E8C87A`) / **Umber** (`#3A2410`): brass lit and brass in shadow —
  the bevel pair on a brass surface, and the ink on one.

### Tertiary
- **Periwinkle** (`#7A6BE8`): the only cool colour in the system. Informational
  log lines and links. It exists so "the machine is telling you something" never
  has to borrow the colour that means "do this next".

### Light set
Two entries added on 2026-08-05, when light became the default rendition. Both
went in here and in `src/theme/tokens.ts` in the same change, which is what the
Sixteen Rule asks of a genuine addition.

- **Cream** (`#F5EFE3`): the light theme's ground. Every existing light entry in
  the palette is cool — `bone` is pink-grey — and paper is warm.
- **Indigo** (`#4A3FB0`): periwinkle for a light ground, 6.98:1 on cream. It
  exists because `periwinkle` measures 3.6:1 there and could not simply be
  swapped for a red, which would have borrowed the colour that means "do this
  next" for the colour that means "the machine is telling you something".

### Neutral
- **Void** (`#0A0407`): the screen with nothing lit on it in the dark theme, and
  primary text in the light one. The base of most dark dithers.
- **Abyss** (`#16070E`): window bodies and input wells.
- **Oxblood** (`#2A0A16`): raised panels, inactive navigation cells, locked nodes.
- **Wine** (`#4A0E20`): the dark end of the field gradient.
- **Slate** (`#5A4A55`): hairlines, unwalked edges, cell outlines. Never text — it
  measures 2.4:1 on void and fails at every size.
- **Haze** (`#A794A0`): secondary text. 7:1 on void, so it is safe at 12px.
- **Bone** (`#EDE7EA`): primary text.
- **White** (`#FFFFFF`): the lit edge of a bevel. Not a text colour.

### Named Rules

**The Palette Budget Rule.** A screen that needs an intermediate colour uses a
dither pair from its active preset. Genuinely adding a semantic role requires an
entry in `ThemePalette`, every preset, and the relevant contrast tests in the same
change. Components do not expand the palette locally.

## Themes

The runtime contract is `ThemePalette` in `src/theme/themes.ts`. Obsidian
Blueprint, Cyber Neon, Emerald Terminal, Solar Warmth, and Nord Frost each own
the canvas, node states, three edge states, HUD, navigation, and XP meter. The
System screen previews and applies them immediately, and the stored choice is
hydrated before app content paints so launch never flashes through the default.

Geometry, typography, touch targets, and non-colour status cues do not move
between presets. Components consume semantic roles through `useAppTheme()`;
raw palette values in a component remain a defect.

### Retired two-theme model

The notes below document the former Auto/Light/Dark implementation and are kept
only as design history. They no longer describe runtime behavior.

Two renditions of one grammar. **Light is the default**; dark is the option, and
the preference is three-way — Auto follows the device, Light and Dark pin it.
Auto is the default so a phone already on a schedule is obeyed without being
asked, and pinning exists because a student reading in bed on a phone that never
leaves light mode should be allowed the dark screen.

Nothing about the grammar moves between them: same square corners, same 2dp
bevels, same ordered dither, same one typeface, same three encodings of status.
What moves is which palette index plays which role, and three of those could not
be a straight inversion:

- **Mastered.** `brass` is 1.98:1 on a light ground, and mastered is the most
  important earned state in the product. On light it becomes `umber` — brass in
  shadow — and keeps the metal family through a `brass` bevel and `gold` ink.
- **Secondary text.** `haze` fails on light; `slate` takes it. See the
  Slate-Is-Not-Ink Rule above.
- **Focus.** `blush` is near-white on cream, so light focus is `cardinal`.

**Cardinal is the dominant surface in the dark theme and a signal in the light
one.** The full-bleed cardinal field is what a dark screen has instead of paper;
on cream the field is a gentle `cream`→`bone` dither and cardinal is spent on the
nodes a student can act on. That is a real difference in register between the two,
and it is deliberate: the light theme reads as a printed chart, the dark one as a
lit screen.

Every screen resolves its colours through `useTheme()`. A `palette.` reference
inside a component is a defect — it is how one control ends up dark in a light
app.

**The No-Blend Rule.** No gradient, no alpha ramp, no interpolated tone. Every
intermediate value is a 4×4 ordered (Bayer) dither of two palette entries on a
2dp cell. A CSS or SVG gradient anywhere in this product is a bug.

**The canvas backdrop is the student's, and still obeys the rule.** The chart
alone lets a student change what it is drawn on — a dither gradient, a blueprint
grid, dots, scanlines, a diagonal weave, or a photo of their own
(`src/theme/backdrops.ts`, drawn by `src/ui/Backdrop.tsx`). Every pattern is
whole palette entries on the 2dp cell, so none of them is the gradient the rule
forbids. A photo arrives with tones of its own and is the one exception; it is
dimmed with a Bayer scrim rather than an alpha ramp, and the scrim is there so
node labels keep their contrast over whatever the student chose. The choice
lives on the account, not the device, which is why a picked photo is stored
inline rather than as the `file://` URI the picker returns.

**The Slate-Is-Not-Ink Rule — on a dark ground.** `slate` draws lines there. The
moment it sets text on `void` the screen fails contrast at 2.46:1: use `haze` for
secondary text, `bone` for anything that matters.

The rule is about the ground, not about slate. On `cream` the two swap places:
`slate` is a sound secondary ink at 7.20:1 and `haze` fails at 2.48:1. This is
why no screen picks its own ink — `theme.inkMuted` resolves to whichever is
correct, and a raw `palette.` reference in a component is the bug this prevents.

## Typography

**Display Font:** DotGothic16 (the platform sans appears only while it loads)
**Body Font:** DotGothic16
**Label Font:** DotGothic16

**Character:** One face for everything, because the machines this grammar comes
from had one font in ROM and every screen was set in it. DotGothic16 is a modern
outline face drawn on the 16-dot bitmap grid those screens used, so it keeps the
pixel character while still scaling with the operating system's text-size
setting — which a true bitmap font would not.

### Hierarchy
- **Display** (44px / 52px): the boot screen only. One per app, not one per screen.
- **Headline** (32px / 40px): reserved; no shipped screen uses it yet.
- **Title** (20px / 28px, +0.5 tracking): screen headings and the course name.
- **Body** (16px / 24px): every sentence a student reads.
- **Label** (16px / 24px, +1 tracking): window title bars and control labels.
- **Micro** (12px / 16px, +0.5 tracking): XP counts, levels, status words, codes.
  The floor — below 12px a 16-dot face loses its counters.

### Named Rules

**The One Face Rule.** The whole interface is DotGothic16. A second family is a
second design.

**The Twelve Floor Rule.** Nothing is set below 12px, and anything at 12px is
`bone` or `haze` — never `slate`, and never an unmeasured colour on the cardinal
field.

**The Uppercase-Is-Chrome Rule.** Uppercase belongs to chrome: window titles,
status words, navigation cells, log lines. Never a sentence. And no eyebrow label
above a heading — the heading carries its own weight.

## Layout

An 8px cell with a 4px half-cell. Every gap is one of `2 / 4 / 8 / 16 / 24 / 32 /
48`, and line heights are multiples of 8 so consecutive lines land on the grid.

Regions are fixed and do not reorder between screens: marginalia at the top, the
work in the middle, a docked window or summary bar above the bottom edge, and the
five-cell navigation bar at the edge itself. Reading surfaces cap at 560px and
centre; the chart does not cap, because it is a map.

The chart uses a Dagre-generated left-to-right prerequisite layout with
orthogonal, stepped connectors. It supports mouse-wheel and pinch zoom from 50%
to 200%, pointer-centred zoom, direct pan without drag-end snapping, and minimap
reset. On arrival it eases toward the current in-progress section (or one
recommended node), while reduced-motion mode applies the same destination
without travel. Zoom, fit, edit-mode, and edit actions occupy one wrapping HUD
rail immediately left of the fixed-size minimap so bottom mission chrome can
never cover the controls.

Touch targets are at least 44×44dp everywhere, chart nodes included — the node
cell *is* 44dp, so the mark and the hit area are one object.

## Elevation & Depth

**No shadows. None.** Depth is an edge: a raised surface is lit along its top and
left and dark along its bottom and right, exactly 2dp wide; an inset surface swaps
the two. That is the entire elevation system.

Pressing a control swaps its bevel from raised to inset with no transition, and
that is the whole press animation. A bevel that eases is a bevel lying about being
a physical key.

Motion is short and structural. Primary navigation uses a single-canvas pixel
wipe: cover, switch at full coverage, then uncover in 400–500ms above the bottom
navigation bar. Drawers animate both entry and exit while remaining mounted until
their close transition finishes. Available and recommended nodes pulse through a
layout-neutral outer ring, using CSS keyframes on web rather than accumulating
JavaScript animation loops. Every animation is skipped under reduce-motion, and
the end state is correct without any of them.

### Named Rules

**The Edge-Not-Shadow Rule.** If depth is needed it is a bevel. A `box-shadow` in
this product — soft, hard, or coloured — is a defect.

**The Inset-Means-Enterable Rule.** Inset bevels mean "put something here or read
something out of here": input wells, window bodies, pressed controls. Raised
bevels mean "this is an object you can act on".

## Shapes

Square. Radius is `0px` system-wide and there is no rounded variant. The recurring
silhouettes are the cell (a 44dp square), the band (a full-width strip of fixed
height), and the window (a titled rectangle with a close box).

Icons are 8×8 bitmaps drawn as rectangles and scaled by viewBox, so a check on the
chart is the same object as a check in a list, at any size and in any palette
colour. There is no icon font and no emoji.

## Components

### Buttons
- **Shape:** square (0px), 2dp bevel, minimum height 44dp.
- **Primary:** `cardinal` fill, `bone` label, 8px/16px padding.
- **Secondary:** `oxblood` fill, `bone` label — same geometry, quieter tone.
- **Pressed:** the bevel inverts to inset, instantly. No colour change, no scale.
- **Disabled:** `oxblood` fill, `haze` label, raised bevel dropped.

### Cards / Containers
- **Corner style:** square (0px).
- **Background:** `oxblood` raised for panels; `abyss` for anything read out of.
- **Shadow strategy:** none — see Elevation & Depth.
- **Border:** the 2dp bevel is the border.
- **Internal padding:** 16px, with 8px between grouped children.

### Inputs / Fields
- **Style:** inset 2dp bevel on `abyss`, `bone` text, square, minimum 44dp tall,
  with a 12px `haze` label above the well.
- **Placeholder:** `haze`.

### Navigation
Five equal cells—Chart, Missions, Courses, Record, and System—are fixed to the
bottom edge, each with a pixel icon over a 12px uppercase label. The active cell
uses `navActiveTab`; the bar and inactive cells use theme HUD/surface roles. Cells
never reorder and never collapse into a menu. The bar is hidden on authentication
and syllabus check-in screens. All tab changes go through the global pixel-wipe
interceptor, while primary views remain mounted and inactive views use
`display: none` so the chart keeps its camera without compositor overhead.

### Course switching and library rows
The navbar course switcher is a row-only popover: it has no duplicate heading or
close bar, opens beneath the course trigger, and closes from the trigger or an
outside press. Its short eased reveal communicates that attachment and is
removed under reduced motion. Each course is one fixed-height outlined row; the
title, metadata, active treatment, and borderless action trigger share that
single surface. The active border encloses the whole row rather than stopping
before the action target.

The dedicated Courses screen uses the same unified-row rule and adds a drag grip
and zero-padded position before the course identity. Only the grip starts a drag.
The dots trigger opens the shared anchored action popover for rename, reset,
duplicate/fork, and delete. Reordering updates indices immediately and saves to
the device first; database synchronization may finish later without reverting
the visible order.

### Window (signature component)
A titled panel: a `cardinal` title bar in uppercase label type, a close box on the
right, and an `abyss` body inset inside the frame. On a phone it docks to the
bottom rather than floating — minimise and maximise are desktop affordances and
are not reproduced as decoration. It carries `accessibilityLiveRegion="polite"`,
because on the chart it is how the app answers a tap.

### Node cell (chart)
A minimum 44dp pixel-bordered target. Locked nodes use a lock glyph and dashed
connector; available nodes use an active topic glyph and pulsing outer ring;
in-progress nodes include mission XP progress; mastered nodes use a checkmark and
completed pathway colour; AI-recommended nodes add a distinct aura without
changing geometry. Contextual 8×8 SVG icons are selected from syllabus keywords
or the parser's `icon_key`. Every state keeps a text label and shape cue in
addition to colour.

### Meter
Progress is lit cells, never a bar: 8×10dp blocks with a 2dp gap, `brass` for
level progress and `cardinal` on an unearned stamp. Sixteen colours cannot draw a
smooth bar, and a segmented meter reads faster anyway.

## Do's and Don'ts

### Do:
- **Do** make every intermediate tone a 4×4 ordered dither of two of the sixteen
  colours, on a 2dp cell.
- **Do** let cardinal own whole regions. It is the surface colour, not a highlight.
- **Do** encode every status three ways — fill colour, drawn glyph, and word.
- **Do** keep 44dp as the minimum touch target, chart nodes included.
- **Do** reserve uppercase for chrome: window titles, status words, nav cells, logs.
- **Do** write log lines that describe something that actually happened. A boot
  sequence reporting systems the build does not have is the one use of this
  grammar that is forbidden.
- **Do** skip every animation under reduce-motion, and make the end state correct
  without it.

### Don't:
- **Don't** add a colour. Sixteen is the system; use a dither pair.
- **Don't** use a gradient, an alpha ramp, or any interpolated tone.
- **Don't** use a shadow. Depth is a 2dp bevel.
- **Don't** round a corner. Radius is 0px everywhere.
- **Don't** set text in `slate`, below 12px, or in `haze` on the cardinal field.
- **Don't** put an eyebrow or kicker label above a heading.
- **Don't** use emoji or an icon font. Icons are 8×8 bitmaps drawn as rects.
- **Don't** ease a press. The bevel inverts instantly or it is not a key.
- **Don't** scale the chart to fit a viewport. It is laid out in dp and scrolls.
