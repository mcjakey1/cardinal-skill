import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth, type AuthRole } from '@/auth/AuthContext';
import { usePrefs } from '@/lib/prefs';
import { KEYBOARD_BEHAVIOR } from '@/ui/keyboard';
import { motion, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { Window } from '@/ui/Window';
import { Bevel, Choice, PixelButton, PixelInput, PixelText } from '@/ui/pixel';

const BOOT = [
  '00: CHART ENGINE READY',
  '01: LOCAL STORAGE MOUNTED',
  '02: AUTH ENGINE ACTIVE',
] as const;

const ROLE_OPTIONS = [
  { value: 'student', label: 'Student' },
  { value: 'instructor', label: 'Instructor' },
] as const;

const MODE_OPTIONS = [
  { value: 'sign-in', label: 'Sign in' },
  { value: 'register', label: 'Register new account' },
] as const;

type AuthMode = (typeof MODE_OPTIONS)[number]['value'];

const ROLE_COPY: Record<AuthRole, string> = {
  student: 'Track your quests, unlock skill nodes, and earn XP.',
  instructor: 'Manage course syllabi, verify student progression, and inspect analytics.',
};

export default function AuthScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const { signIn, register, continueDemo } = useAuth();
  const [role, setRole] = useState<AuthRole>('student');
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(prefs.motionOff ? BOOT.length : 0);

  useEffect(() => {
    if (prefs.motionOff) {
      setShown(BOOT.length);
      return;
    }
    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      setShown(index);
      if (index >= BOOT.length) clearInterval(timer);
    }, motion.quick * 2);
    return () => clearInterval(timer);
  }, [prefs.motionOff]);

  const submit = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password to use live courses and AI tools.');
      return;
    }
    if (mode === 'register') {
      if (!fullName.trim()) {
        setError('Enter your full name to create the account.');
        return;
      }
      if (password !== confirmPassword) {
        setError('The passwords do not match. Re-enter both password fields.');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'register') {
        const result = await register({ role, email, name: fullName, password });
        if (result.confirmationRequired) {
          setNotice('Account created. Confirm your email, then return here and sign in.');
          setMode('sign-in');
          return;
        }
      } else {
        await signIn({ role, email, password });
      }
      prefs.set('role', role);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const launchDemo = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await continueDemo({ role, email: '' });
      prefs.set('role', role);
    } catch {
      setError('Demo mode could not be started on this device. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <Head>
        <title>Sign in · Cardinal Skill</title>
        <meta
          name="description"
          content="Sign in to turn a course syllabus into a navigable skill tree."
        />
      </Head>
      <DitherField bands={11} flat={prefs.lowBandwidth} />
      <KeyboardAvoidingView style={styles.fill} behavior={KEYBOARD_BEHAVIOR}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl },
          ]}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <PixelText variant="display">Cardinal Skill</PixelText>
              <PixelText variant="body" colour={t.ink} style={styles.lede}>
                Your syllabus, drawn as the chart it always was: what depends on what, what&apos;s
                open to you right now, and what you&apos;ve already cleared.
              </PixelText>
            </View>

            <Window title="System" live={false}>
              {BOOT.map((line, index) => (
                <PixelText
                  key={line}
                  variant="body"
                  colour={index === BOOT.length - 1 ? t.earnedText : t.info}
                  style={{ opacity: index < shown ? 1 : 0 }}
                >
                  {line}
                </PixelText>
              ))}
            </Window>

            <Bevel tone="panel" style={styles.selectorGroup}>
              <PixelText variant="micro" colour={t.inkMuted}>OPERATING ROLE</PixelText>
              <Choice value={role} options={ROLE_OPTIONS} onChange={setRole} label="Account role" />
              <PixelText variant="body" colour={t.info}>{ROLE_COPY[role]}</PixelText>
            </Bevel>

            <Choice value={mode} options={MODE_OPTIONS} onChange={setMode} label="Authentication mode" />

            <Window title={mode === 'register' ? 'Register new account' : `${role} sign-in`}>
              {mode === 'register' ? (
                <PixelInput
                  label="Full name"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  textContentType="name"
                  placeholder="Ada Lovelace"
                />
              ) : null}
              <PixelInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                placeholder="you@school.edu"
              />
              <PixelInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                textContentType={mode === 'register' ? 'newPassword' : 'password'}
                placeholder="••••••••"
              />
              {mode === 'register' ? (
                <PixelInput
                  label="Confirm password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  placeholder="••••••••"
                />
              ) : null}
              {error ? (
                <View accessibilityRole="alert">
                  <PixelText variant="body" colour={t.alarm}>{error}</PixelText>
                </View>
              ) : null}
              {notice ? (
                <View accessibilityRole="alert">
                  <PixelText variant="body" colour={t.info}>{notice}</PixelText>
                </View>
              ) : null}
              <PixelButton
                label={busy
                  ? 'Connecting to Supabase…'
                  : mode === 'register'
                  ? 'Create account'
                  : `Sign in as ${role}`}
                disabled={busy}
                onPress={submit}
              />
            </Window>

            <Bevel tone="panel" depth="inset" style={styles.testingNotice}>
              <PixelText variant="micro" colour={t.earnedText}>TESTING MODE</PixelText>
              <PixelText variant="body" colour={t.inkMuted}>
                Demo mode stays on this device. Live syllabus uploads and the AI companion require
                a Supabase account.
              </PixelText>
              <PixelButton
                label={`Continue as demo ${role}`}
                tone="panel"
                disabled={busy}
                onPress={launchDemo}
              />
            </Bevel>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.md },
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: space.md },
  header: { gap: space.cell },
  lede: { maxWidth: 560 },
  selectorGroup: { padding: space.md, gap: space.cell },
  testingNotice: { padding: space.md, gap: space.xs },
});
