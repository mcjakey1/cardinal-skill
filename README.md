# Cardinal Skill

Cardinal Skill turns a course syllabus into a navigable prerequisite graph. Students complete missions to earn XP and unlock skills; instructors author course trees and review course progress.

One Expo + React Native codebase ships to web, iOS, and Android. Expo Router owns navigation, Supabase provides authentication and owner-scoped course data, and server-side Edge Functions keep every AI provider key out of the client bundle.

## Current features

- Unified student/instructor authentication and persisted sessions
- Dynamic DAG skill trees with pan, pointer-centred zoom, minimap reset, and preserved viewport state
- Five persistent theme presets: Obsidian Blueprint, Cyber Neon, Emerald Terminal, Solar Warmth, and Nord Frost
- Pixel-art node states, contextual subject icons, orthogonal connectors, and directional arrows
- Course metadata editing, progress reset confirmation, and course deletion
- Mission editing with live node-XP totals
- Contextual AI study companion with formatted Markdown responses
- PDF/text syllabus upload that generates course metadata, nodes, prerequisites, missions, and Dagre positions
- Cached primary tabs and a GPU-friendly pixel-wipe navigation transition

## Requirements

- Node.js 22 or newer
- npm
- A Supabase project and Supabase CLI
- A b.ai API key for the study companion, quest naming, and help-subtree generation
- An OpenRouter API key for syllabus parsing

## Run locally

```bash
npm install
copy .env.example .env
npm run web
```

Open [http://localhost:8081](http://localhost:8081).

Other Expo targets:

```bash
npm start
npm run android
npm run ios
```

The Windows and Unix launch scripts start Expo web directly:

```bash
launch-cardinal-skill.bat
./launch-cardinal-skill.sh
```

If Metro serves a stale development bundle, restart it with a cleared cache:

```bash
npm run web -- --port 8081 --clear
```

## Supabase setup

Copy the project URL and anon/publishable key into `.env`:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

These are intentionally public client values. Row Level Security is the authorization boundary for every user-owned table.

Link the project, apply all forward-only migrations, configure server secrets, and deploy the functions:

```bash
npx supabase link --project-ref your-project-ref
npx supabase db push --linked
npx supabase secrets set BAI_API_KEY=your-b-ai-key OPENROUTER_API_KEY=your-openrouter-key
npx supabase functions deploy study-companion
npx supabase functions deploy name-quest
npx supabase functions deploy suggest-subtree
npx supabase functions deploy parse-syllabus
```

`BAI_API_KEY`, `OPENROUTER_API_KEY`, and the Supabase service-role key must never use an `EXPO_PUBLIC_` name or appear in client code.

## AI pipeline

| Feature | Provider | Server boundary |
| --- | --- | --- |
| Study companion | b.ai / DeepSeek V4 Flash | `study-companion` Edge Function |
| Quest naming | b.ai / DeepSeek V4 Flash | `name-quest` Edge Function |
| Adaptive help subtree | b.ai / DeepSeek V4 Flash | `suggest-subtree` Edge Function |
| Syllabus-to-DAG parsing | OpenRouter / NVIDIA Nemotron 3.5 Lightning | `parse-syllabus` Edge Function |

PDFs are sent from the Edge Function as base64 file inputs through OpenRouter's free Cloudflare PDF parser. Generated graph JSON is validated and normalized before database writes. Course-owner RLS policies control node, mission, and prerequisite creation.

The parser status indicator validates the configured key without consuming inference tokens. OpenRouter usage begins only when an actual syllabus parse reaches the completion endpoint.

## Project layout

```text
app/                      Expo Router routes for web, iOS, and Android
src/auth/                 Session context and authentication UI
src/features/skilltree/   Graph types, progression rules, layout, and chart UI
src/lib/                  Supabase, cache, PDF, Markdown, and Edge adapters
src/theme/                Semantic theme presets and platform bindings
src/ui/                   Cross-platform pixel UI, navigation, drawers, and transitions
supabase/migrations/      Forward-only schema and RLS policies
supabase/functions/       Server-only AI and course-generation functions
```

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build:web
npx expo export --platform android
```

See [DESIGN.md](DESIGN.md) for the visual system and [AGENTS.md](AGENTS.md) for architecture invariants and the full definition of done.
