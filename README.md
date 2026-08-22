# Cardinal Skill

Cardinal Skill turns a course syllabus into a navigable prerequisite tree. Students clear coursework to unlock skills and earn XP; instructors author trees and review course progress.

The product is one Expo + React Native application for web, iOS, and Android. Expo Router provides the routes, Supabase provides data/auth/storage, and shared TypeScript modules hold progression rules.

## Run locally

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run web
```

Open [http://localhost:8081](http://localhost:8081).

You can also use:

```bash
npm start       # interactive Expo server
npm run android
npm run ios
```

The Windows and Unix launch scripts start the Expo web app directly:

```bash
launch-cardinal-skill.bat
./launch-cardinal-skill.sh
```

## Environment

Copy `.env.example` to `.env` and provide the public Supabase URL and anon key. These values are included in the client bundle and remain safe only because Row Level Security protects every table.

Never place `ANTHROPIC_API_KEY` or the Supabase service-role key in an `EXPO_PUBLIC_*` variable. Server secrets belong in Supabase Edge Function secrets.

## Project layout

```text
app/                      Expo Router routes for web, iOS, and Android
src/features/skilltree/   Graph types, progression rules, queries, and chart UI
src/lib/                  Clients and shared adapters
src/theme/                Student and instructor design tokens
src/ui/                   Cross-platform UI components
supabase/migrations/      Forward-only database schema and RLS policies
supabase/functions/       Server-side Edge Functions
```

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build:web
```

See [AGENTS.md](AGENTS.md) for architecture invariants and the full definition of done.
