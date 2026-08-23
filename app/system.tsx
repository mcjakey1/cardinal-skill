import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePrefs } from '@/lib/prefs';
import { clearLocal } from '@/lib/progress';
import { useAppTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { Window } from '@/ui/Window';
import { ThemePickerModal } from '@/ui/ThemePickerModal';
import { usePixelTransition } from '@/ui/PixelTransition';
import { Bevel, PixelButton, PixelText, Toggle } from '@/ui/pixel';
import { useAuth } from '@/auth/AuthContext';

export default function System() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, logout } = useAuth();
  const { transition } = usePixelTransition();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const { theme } = useAppTheme();
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const wipe = async () => {
    if (!prefs.lastCourseId) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await clearLocal(prefs.lastCourseId);
    setConfirming(false);
    setCleared(true);
  };

  const signOut = () => {
    if (!confirmingLogout) {
      setConfirmingLogout(true);
      return;
    }
    transition(() => {
      queryClient.clear();
      prefs.set('role', null);
      void logout();
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <DitherField variant="quiet" bands={7} flat={prefs.lowBandwidth} />
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + space.cell }]}>
        <Head>
          <title>System · Cardinal Skill</title>
          <meta name="description" content="Theme, motion, bandwidth, and this device's record." />
        </Head>

        <PixelText variant="title">System</PixelText>

        <Bevel tone="panel" style={styles.group}>
          <Row
            title="Theme"
            detail={`${theme.name} controls the canvas, nodes, edges, HUD, and navigation.`}
          >
            <PixelButton
              label="Choose"
              tone="panel"
              grow={false}
              onPress={() => setThemePickerOpen(true)}
            />
          </Row>

          <Row
            title="Motion"
            detail={
              prefs.motionOff && !prefs.reduceMotion
                ? 'Your device asks for reduced motion, so it stays off here.'
                : 'The chart wipes open when a node unlocks.'
            }
          >
            <Toggle
              label="Motion"
              value={!prefs.motionOff}
              onChange={(on) => prefs.set('reduceMotion', !on)}
            />
          </Row>

          <Row
            title="Low bandwidth"
            detail="Draws flat fields instead of dithered ones. Loses texture, nothing else."
          >
            <Toggle
              label="Low bandwidth"
              value={prefs.lowBandwidth}
              onChange={(on) => prefs.set('lowBandwidth', on)}
            />
          </Row>
        </Bevel>

        <Bevel tone="panel" style={styles.group}>
          <Row title="Profile" detail="Your name, program, and the pace you are aiming for.">
            <PixelButton
              label="Open"
              tone="panel"
              grow={false}
              onPress={() => transition(() => router.navigate('/profile'))}
            />
          </Row>

          <Row
            title="Instructor view"
            detail="Cohort progress and per-node completion counts, for whoever teaches this course."
          >
            <PixelButton
              label="Open"
              tone="panel"
              grow={false}
              onPress={() => transition(() => router.navigate('/instructor'))}
            />
          </Row>

          <Row
            title="Study companion"
            detail={session?.source === 'supabase'
              ? 'Connected to the live b.ai study model through Supabase.'
              : 'Demo responses are local. Sign in with Supabase to use the live study model.'}
          >
            <PixelButton
              label="Open"
              tone="panel"
              grow={false}
              onPress={() => transition(() => router.navigate('/companion'))}
            />
          </Row>
        </Bevel>

        <Window title="This build" live={false}>
          <PixelText variant="body" colour={t.ink}>
            {session
              ? session.source === 'supabase'
                ? `${session.name} is signed in as ${session.role} with Supabase.`
                : `${session.name} is using the local ${session.role} demo.`
              : 'No session is active.'}
          </PixelText>
          <PixelText variant="body" colour={t.inkMuted}>
            Version {Constants.expoConfig?.version ?? '0.1.0'}
          </PixelText>
        </Window>

        <Bevel tone="panel" style={styles.group}>
          <Row
            title="Sign out"
            detail={confirmingLogout
              ? 'This clears the app session and any Supabase authentication tokens on this device.'
              : `End the ${session?.role ?? 'current'} session and return to authentication.`}
          >
            <PixelButton
              label={confirmingLogout ? 'Confirm sign out' : 'Sign out'}
              tone={confirmingLogout ? 'brand' : 'panel'}
              grow={false}
              onPress={signOut}
            />
          </Row>
        </Bevel>

        {prefs.lastCourseId ? (
          <Bevel tone="panel" style={styles.group}>
            <Row
              title="Clear this device's record"
              detail={
                cleared
                  ? 'Cleared. Reopen the chart to see it.'
                  : confirming
                    ? 'This deletes every completion stored here for the chart you last opened. It cannot be undone.'
                    : 'Deletes every completion stored on this device for the chart you last opened.'
              }
            >
              <PixelButton
                label={confirming ? 'Confirm clear' : 'Clear'}
                tone={confirming ? 'brand' : 'panel'}
                grow={false}
                onPress={wipe}
              />
            </Row>
          </Bevel>
        ) : null}
      </ScrollView>
      <ThemePickerModal visible={themePickerOpen} onClose={() => setThemePickerOpen(false)} />
    </View>
  );
}

function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <PixelText variant="body">{title}</PixelText>
        <PixelText variant="micro" colour={t.inkMuted}>
          {detail}
        </PixelText>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.md, gap: space.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  group: { padding: space.md, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowText: { flex: 1, gap: space.hair },
});
