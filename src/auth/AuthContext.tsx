import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { lockAdmin } from '@/lib/admin';
import { clearCourseCaches } from '@/lib/courseCache';
import { fetchInstructorVerification } from '@/features/skilltree/courseCatalog';
import {
  authErrorMessage,
  buildSession,
  normalizeSession,
  resolveSessionRole,
  type RoleEvidence,
  type SessionInput,
  type UserSession,
} from './session';
import { withTimeout } from './timeout';

export type { AuthRole, UserSession } from './session';

interface AuthValue {
  ready: boolean;
  session: UserSession | null;
  signIn: (input: Pick<SessionInput, 'email' | 'password'>) => Promise<UserSession>;
  register: (input: Required<SessionInput>) => Promise<RegistrationResult>;
  continueDemo: (input: SessionInput) => Promise<UserSession>;
  logout: () => Promise<void>;
}

interface RegistrationResult {
  session: UserSession | null;
  confirmationRequired: boolean;
}

const SESSION_KEY = 'cardinal.auth-session.v1';
const AUTH_REQUEST_TIMEOUT_MS = 15_000;
const AUTH_TIMEOUT_MESSAGE = 'Supabase took too long to respond. Check your connection and try again.';

/**
 * Ask the server what this account is. Returns null when nobody is signed in
 * or a read fails, which leaves the stored role alone.
 *
 * Only an official course counts as ownership: a student who uploads a syllabus
 * owns a private practice course, and that must not read as teaching.
 */
async function readRoleEvidence(): Promise<RoleEvidence | null> {
  try {
    // The local session, not getUser(): metadata is already in it, and a
    // demo-free launch on a dead network should not wait on a round trip.
    const { data: auth } = await withTimeout(
      supabase.auth.getSession(),
      AUTH_REQUEST_TIMEOUT_MS,
      AUTH_TIMEOUT_MESSAGE,
    );
    const user = auth.session?.user;
    if (!user) return null;
    const [verifiedInstructor, courses] = await withTimeout(
      Promise.all([
        fetchInstructorVerification(),
        supabase
          .from('courses')
          .select('id')
          .eq('owner_id', user.id)
          .eq('course_kind', 'official')
          .limit(1),
      ]),
      AUTH_REQUEST_TIMEOUT_MS,
      AUTH_TIMEOUT_MESSAGE,
    );
    if (courses.error) throw courses.error;
    return {
      // Protected app metadata is authoritative once present. Legacy evidence
      // is considered only when an older project has not written this field.
      metadataRole: user.app_metadata?.account_type,
      verifiedInstructor,
      ownsOfficialCourse: (courses.data ?? []).length > 0,
    };
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthValue>({
  ready: false,
  session: null,
  signIn: async () => { throw new Error('AuthProvider is missing.'); },
  register: async () => ({ session: null, confirmationRequired: false }),
  continueDemo: async () => { throw new Error('AuthProvider is missing.'); },
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([AsyncStorage.getItem(SESSION_KEY), supabase.auth.getSession()])
      .then(([raw, auth]) => {
        if (!live) return;
        if (!raw) return;
        try {
          const saved = normalizeSession(JSON.parse(raw));
          if (saved?.source === 'supabase' && !auth.data.session) {
            void AsyncStorage.removeItem(SESSION_KEY);
            setSession(null);
            return;
          }
          setSession(saved);
          // A launch starts on the persisted role and corrects it in the
          // background; the last launch already saved the corrected value.
          if (saved?.source === 'supabase') {
            void readRoleEvidence().then((evidence) => {
              const corrected = resolveSessionRole(saved, evidence);
              if (!live || !corrected || corrected === saved) return;
              setSession(corrected);
              void AsyncStorage.setItem(SESSION_KEY, JSON.stringify(corrected));
            });
          }
        } catch {
          setSession(null);
        }
      })
      .catch(() => {
        if (live) setSession(null);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => { live = false; };
  }, []);

  const persist = useCallback(async (input: SessionInput, source: UserSession['source']) => {
    const claimed = buildSession(input, source);
    // Correct the role before the first screen is chosen, so an instructor who
    // signed in through the student tab still lands in the workspace.
    const next = source === 'supabase'
      ? resolveSessionRole(claimed, await readRoleEvidence()) ?? claimed
      : claimed;
    setSession(next);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return next;
  }, []);

  const signIn = useCallback(async (input: Pick<SessionInput, 'email' | 'password'>) => {
    if (input.email.trim() && input.password) {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: input.email.trim(),
          password: input.password,
        }),
        AUTH_REQUEST_TIMEOUT_MS,
        AUTH_TIMEOUT_MESSAGE,
      );
      if (error) throw new Error(authErrorMessage(error.message));
      // Live sign-in never accepts a role claim from the form. Start at the
      // least-privileged surface and let server evidence promote the account.
      return persist({ ...input, role: 'student' }, 'supabase');
    }
    throw new Error('Enter your email and password to sign in.');
  }, [persist]);

  const register = useCallback(async (input: Required<SessionInput>) => {
    if (input.email.trim() && input.password) {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email: input.email.trim(),
          password: input.password,
          options: { data: { full_name: input.name, role: input.role } },
        }),
        AUTH_REQUEST_TIMEOUT_MS,
        AUTH_TIMEOUT_MESSAGE,
      );
      if (error) throw new Error(authErrorMessage(error.message));
      if (!data.session) return { session: null, confirmationRequired: true };
      return { session: await persist(input, 'supabase'), confirmationRequired: false };
    }
    throw new Error('Enter your name, email, and password to register.');
  }, [persist]);

  const continueDemo = useCallback(
    (input: SessionInput) => persist({ ...input, email: '' }, 'demo'),
    [persist],
  );

  const logout = useCallback(async () => {
    setSession(null);
    // The admin gate is module state, so without this it survives the sign-out
    // and the next person to sign in on this page load walks straight into the
    // admin area. The server refuses them everything, so it is not an
    // escalation — but the panel tells the reader in writing that nothing is
    // left open behind them, and that has to be true.
    lockAdmin();
    await Promise.allSettled([
      AsyncStorage.removeItem(SESSION_KEY),
      supabase.auth.signOut(),
      clearCourseCaches(),
    ]);
  }, []);

  const value = useMemo<AuthValue>(() => ({
    ready,
    session,
    signIn,
    register,
    continueDemo,
    logout,
  }), [continueDemo, logout, ready, register, session, signIn]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
