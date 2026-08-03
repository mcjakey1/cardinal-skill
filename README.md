# Cardinal Skill (formerly SkillQuest)

Transform course syllabi into navigable, interactive skill trees.

Cardinal Skill converts standard academic course outlines into prerequisite learning graphs. Completing coursework unlocks nodes and earns XP, providing students with a visual mastery map rather than a flat list of due dates.

Built with a Mapúa-inspired design system (cardinal red, gold, cream, and charcoal). The primary web MVP lives in `/frontend` (Next.js App Router), supported by Supabase backend services and edge functions.

---

## Current Project State & Major Features

### 1. Data-Driven Skill Tree Layout Engine (`/frontend/lib/auto-layout.ts`)
* **Dynamic Automatic Layout**: Powered by the Dagre layered graph algorithm (`TB` top-to-bottom layout mode).
* **Zero Hardcoded Coordinates**: Automatically computes node $(X,Y)$ positions and bounding canvas dimensions for graphs with 6 to 50+ nodes, single or multiple root nodes, and complex branching/merging prerequisite paths.
* **Compact Spacing**: Configured with $95\text{px}$ vertical rank separation and $75\text{px}$ horizontal sibling separation, preventing node or label collisions.
* **Canvas Interactivity**: Isolated pointer canvas panning, non-passive mouse wheel zooming (`fitView` at 62–65% zoom), reset view, and selected node focusing.

### 2. Separation of Academic Graph Data & User Layout Preferences (`/frontend/lib/tree-layout-persistence.ts`)
* **API Payload Integrity**: The API returns pure course metadata and learning nodes with `prerequisiteIds`. $X/Y$ coordinates are derived on the client.
* **User Repositioning Persistence**: Students can drag nodes to personalize their layout. Custom positions are stored separately in `localStorage` under `cardinal-skill:tree-layout:${userId}:${courseId}`.
* **Resilient Merging**: If an updated syllabus introduces new skills, existing user node positions are preserved while new nodes receive automatic layout positions.
* **Layout Controls**: Includes "Auto-arrange", "Reset layout" with confirmation modal, and a "Layout saved" status indicator.

### 3. Graph Validation & Error Detection (`/frontend/lib/graph-validation.ts`)
* **DFS Cycle Detection**: Checks for prerequisite cycles and missing reference IDs before rendering.
* **Developer Error Callouts**: Displays user-friendly error callouts explaining invalid prerequisite references or dependency loops.

### 4. Living Mastery Hero Skill Tree (`/frontend/components/hero-skill-tree.tsx`)
* **Home Page Visual**: Polished decorative 4-tier interactive hero skill tree flowing from Foundations (Root) $\rightarrow$ Programming & Critical Thinking $\rightarrow$ Data Structures & Algorithms $\rightarrow$ Academic Mastery.
* **Micro-Animations**: SVG Bezier branch-drawing path animations, staggered node entrance pops, gentle active glows, particle drift, and interactive hover tooltips.
* **Accessibility**: Respects `prefers-reduced-motion` settings.

### 5. Responsive Student Profile Page (`/frontend/lib/profile-persistence.ts`)
* **Responsive Layout**: Constrained $1440\text{px}$ container with a 2-column desktop grid (`minmax(0, 1.4fr)` summary card + `minmax(320px, 1fr)` Academic Info card) that stacks cleanly on tablet and mobile viewports.
* **Profile State Persistence**: Single source of truth stored in `localStorage` under `cardinal-skill:profile:${userId}` with instant sidebar avatar & name synchronization.
* **Form Validation**: Email pattern regex validation, inline error text, save loading state, and green success toast feedback.

### 6. Development Mock Datasets
Built-in dropdown switcher in the tree toolbar allowing instant testing of 6 distinct scenarios:
1. `CS210 Data Structures & Algorithms` (16 skills, branching)
2. `CS101 Introduction to CS` (6 skills, linear track)
3. `CS300 Software Engineering` (25 skills, wide realm)
4. `MATH201 Discrete Math` (4 skills, dual root foundation)
5. `Invalid Data: Missing Prereq`
6. `Invalid Data: Cycle Loop`

---

## Structure

```
frontend/                 Main web application MVP (Next.js 16, App Router, TypeScript, Tailwind CSS)
  app/                    Next.js app router pages & global CSS tokens
  components/             CardinalApp dashboard, SkillTree renderer, HeroSkillTree, Sidebar, Details Panel
  lib/                    Auto-layout (Dagre), Graph Validation (DFS), Repository mock API, Profile & Layout Persistence
src/                      Pure progression rules & Node.js unit test suite
supabase/                 Supabase DB migrations, RLS policies, & Deno Edge Functions
requirements.txt          Placeholder for future Python backend & AI data pipeline microservices
launch-cardinal-skill.bat One-click local launch script
```

---

## Getting Started

### 1. Launch Web Application (Frontend MVP)
Run the automated launcher script or start the dev server directly:

```bash
# Option A: Windows Batch Launcher
.\launch-cardinal-skill.bat

# Option B: Direct npm dev command
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Quality Checks

```bash
# Run TypeScript typecheck (Frontend)
cd frontend
npm run typecheck

# Run Next.js production build
npm run build

# Run Node.js unit tests (Root)
cd ..
npm test
```

---

## System Architecture

```
  Syllabus (PDF / DOCX)
          │
          ▼
   Supabase Edge Function  ──► Claude AI structured JSON extraction
          │
          ▼
  SkillTreePayload         ──► Schema: course info + nodes + prerequisiteIds
          │
          ▼
   Frontend Web App        ──► Dagre Auto-Layout + Graph Validation (DFS)
          │
          ▼
   User Custom Positions   ──► Persisted separately in localStorage (user:course layout)
```

---

## Roadmap / Future Backend Integration

- **Live Supabase Auth & RLS**: Replace local mock adapter with real Supabase Auth and Row Level Security policies.
- **AI Syllabus Parser Pipeline**: Connect PDF/DOCX import directly to the Deno Edge Function API.
- **Backend Layout Persistence**: Mirror `UserTreeLayout` and `StudentProfile` to Supabase Postgres user tables.
- **LMS Integration & Guilds**: Canvas/Blackboard syllabus sync and student study groups.
