# Cardinal Skill backend handoff

## Architecture
The frontend consumes typed contracts in `lib/cardinal-domain.ts`. Demo records and the mock adapter live in `lib/cardinal-repository.ts`. Replace `cardinalRepository` with a server-backed implementation while preserving the `CardinalRepository` interface; components should consume queries through a provider/SWR hooks rather than importing fixtures in production.

## Proposed entities
- User/Profile: identity, role, program, year level, XP and streak summary.
- Course/Enrollment: course metadata and user-specific membership/progress.
- SkillNode/SkillEdge/SkillProgress: normalized graph, prerequisites and per-user mastery.
- Mission/MissionSubmission: challenge definition, attempts, evidence, feedback and status.
- Achievement/UserAchievement: badge definition and unlock event.
- Preference/Notification: user privacy and communication settings.
- InstructorCourseAccess: explicit authorization to cohort analytics.

All IDs should remain opaque strings. Persist timestamps as UTC and return ISO 8601 strings. Derive XP, course mastery and streaks server-side from immutable events where practical.

## API/query operations
`me`, `courses`, `courseSkills(courseId)`, `missions(filters)`, `achievements`, `instructorAnalytics(courseId)`, `updateMissionStatus`, `submitMission`, `updateProfile`, `updatePreferences`, `importSyllabus`, and `companionMessage`. Add pagination to missions, notifications and cohort data.

## Security and permissions
Use real email/password auth and secure HTTP-only sessions. Scope every student query by session user ID. Verify instructor-course membership server-side before returning analytics or CSV exports. Validate uploads by MIME type, extension, size and content scanning; keep originals private. Validate every mutation input and never trust role, XP, ownership, price-like rewards, or progress values from the client.

## External boundaries
- Syllabus import: private object storage, document extraction, reviewable draft graph, then explicit publish mutation.
- AI companion: authenticated streaming endpoint, course-context retrieval, safety limits and conversation retention policy.
- CSV export: server-generated, authorized, auditable response.
- Notifications: durable preference records and an asynchronous delivery worker.

## Simulated today
Authentication, repository latency, mission updates, syllabus parsing, companion responses, export, notifications and preference persistence are prototype-only. UI navigation is intentionally client-state based; migrate routes to App Router segments when wiring the backend.
