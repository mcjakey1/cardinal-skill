/**
 * Instructor workspace routes.
 *
 * The student experience left this app: Expo (`app/` + `src/`) owns it on web,
 * iOS and Android. What remains here is the desk-scale half of the product —
 * authoring a course's tree and reading how a cohort is moving through it.
 */

export const APP_ROUTES = {
  courses: 'courses',
  tree: 'tree',
  students: 'students',
  analytics: 'analytics',
  imports: 'imports',
  settings: 'settings',
} as const

export type AppRoute = (typeof APP_ROUTES)[keyof typeof APP_ROUTES]

/**
 * What each role may do.
 *
 * `instructor` previously carried only `view:*` and `export:analytics`, which
 * contradicted PRODUCT.md — that document has instructors authoring and curating
 * the tree, naming quests, and grafting supplemental help. The capability list
 * was the side that was wrong; authoring is what this workspace is for.
 *
 * `admin` is the registrar/IT role: roster and enrolment work, never course
 * content and never a named student's grades.
 */
export const ROLE_CAPABILITIES = {
  student: ['view:skills', 'complete:missions', 'manage:profile'],
  instructor: [
    'view:skills',
    'view:analytics',
    'export:analytics',
    'author:tree',
    'author:quest-names',
    'author:help-subtree',
    'publish:tree',
    'import:syllabus',
  ],
  admin: ['view:analytics', 'export:analytics', 'manage:roster', 'manage:enrolment'],
} as const

export type Role = keyof typeof ROLE_CAPABILITIES
export type Capability = (typeof ROLE_CAPABILITIES)[Role][number]

export function can(role: Role, capability: Capability): boolean {
  return (ROLE_CAPABILITIES[role] as readonly string[]).includes(capability)
}
