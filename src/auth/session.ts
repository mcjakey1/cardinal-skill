export type AuthRole = 'student' | 'instructor';

export interface UserSession {
  isAuthenticated: boolean;
  source: 'supabase' | 'demo';
  role: AuthRole;
  email: string;
  name: string;
}

export interface SessionInput {
  role: AuthRole;
  email: string;
  name?: string;
  password?: string;
}

export function normalizeSession(value: unknown): UserSession | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<UserSession>;
  if (candidate.source !== 'supabase' && candidate.source !== 'demo') return null;
  if (candidate.role !== 'student' && candidate.role !== 'instructor') return null;
  if (typeof candidate.email !== 'string' || typeof candidate.name !== 'string') return null;
  return {
    isAuthenticated: true,
    source: candidate.source,
    role: candidate.role,
    email: candidate.email,
    name: candidate.name,
  };
}

export function buildSession(
  { role, email, name }: SessionInput,
  source: UserSession['source'] = 'demo',
): UserSession {
  const cleanEmail = email.trim() || `${role}@demo.cardinal.local`;
  const fallbackName = cleanEmail.includes('@') ? cleanEmail.split('@')[0] : cleanEmail;
  return {
    isAuthenticated: true,
    source,
    role,
    email: cleanEmail,
    name: name?.trim() || fallbackName || (role === 'student' ? 'Demo student' : 'Demo instructor'),
  };
}

/**
 * What the account actually is, as far as the server will say.
 *
 * The role on a stored session is only the tab the user picked on the sign-in
 * form, so an instructor who signed in through the student tab loses the way
 * back to their workspace. These three facts outrank that claim.
 */
export interface RoleEvidence {
  /** `role` from the user metadata written at sign-up. */
  metadataRole: unknown;
  verifiedInstructor: boolean;
  ownsOfficialCourse: boolean;
}

/**
 * The session with its role corrected against the server, or the same object
 * when nothing needs to change, so callers can skip a needless write.
 *
 * `evidence` is null when there is no server answer — a demo session, or a
 * request that failed — and the stored role then stands. Being offline is not
 * grounds for a demotion.
 *
 * This promotes and never demotes, which is not the same as trusting the
 * client. The three signals are proof of teaching, but their absence is not
 * proof of the opposite: an instructor is created before anyone verifies them,
 * and until an administrator adds that row they own nothing but practice
 * courses and may have registered through the student tab. Demoting on absent
 * evidence would take the workspace away from exactly that account and persist
 * it. Nothing is granted by the role either way — publishing, analytics and
 * every instructor read are gated on the server — so the cost of believing a
 * claimed instructor is a navigation cell they cannot use.
 */
export function resolveSessionRole(
  session: UserSession | null,
  evidence: RoleEvidence | null,
): UserSession | null {
  if (!session || session.source !== 'supabase' || !evidence) return session;
  const instructor = evidence.verifiedInstructor
    || evidence.ownsOfficialCourse
    || evidence.metadataRole === 'instructor';
  const role: AuthRole = instructor ? 'instructor' : session.role;
  return role === session.role ? session : { ...session, role };
}

export function authErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) {
    return 'That email and password do not match. Check them and try again.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Confirm your email from the Supabase message, then sign in again.';
  }
  if (normalized.includes('user already registered')) {
    return 'An account already uses that email. Switch to Sign in.';
  }
  if (normalized.includes('password should be at least')) {
    return 'Use a password with at least 6 characters.';
  }
  if (normalized.includes('fetch') || normalized.includes('network')) {
    return 'Supabase could not be reached. Check your connection and try again.';
  }
  return message.trim() || 'Authentication failed. Try again.';
}
