export const APP_ROUTES = {
  dashboard: 'dashboard', syllabus: 'syllabus', missions: 'missions', universal: 'universal', companion: 'companion', achievements: 'achievements', profile: 'profile', settings: 'settings', instructor: 'instructor', welcome: 'welcome', auth: 'auth', onboarding: 'onboarding'
} as const
export type AppRoute = typeof APP_ROUTES[keyof typeof APP_ROUTES]

export const ROLE_CAPABILITIES = {
  student: ['view:skills','complete:missions','manage:profile'],
  instructor: ['view:skills','view:analytics','export:analytics'],
} as const
