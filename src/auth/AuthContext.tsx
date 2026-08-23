import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { clearCourseCaches } from '@/lib/courseCache';
import {
  authErrorMessage,
  buildSession,
  normalizeSession,
  type SessionInput,
  type UserSession,
} from './session';

export type { AuthRole, UserSession } from './session';

interface AuthValue {
  ready: boolean;
  session: UserSession | null;
  signIn: (input: SessionInput) => Promise<UserSession>;
  register: (input: Required<SessionInput>) => Promise<RegistrationResult>;
  continueDemo: (input: SessionInput) => Promise<UserSession>;
  logout: () => Promise<void>;
}

interface RegistrationResult {
  session: UserSession | null;
  confirmationRequired: boolean;
}

const SESSION_KEY = 'cardinal.auth-session.v1';

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
    const next = buildSession(input, source);
    setSession(next);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return next;
  }, []);

  const signIn = useCallback(async (input: SessionInput) => {
    if (input.email.trim() && input.password) {
      const { error } = await supabase.auth.signInWithPassword({
        email: input.email.trim(),
        password: input.password,
      });
      if (error) throw new Error(authErrorMessage(error.message));
      return persist(input, 'supabase');
    }
    throw new Error('Enter your email and password to sign in.');
  }, [persist]);

  const register = useCallback(async (input: Required<SessionInput>) => {
    if (input.email.trim() && input.password) {
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: { data: { full_name: input.name, role: input.role } },
      });
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
