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
