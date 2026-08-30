import Constants from 'expo-constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchInstructorVerification } from '@/features/skilltree/courseCatalog';
import {
  fetchLeaderboardVisibility,
  setLeaderboardVisibility,
} from '@/features/skilltree/recordQueries';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { usePrefs } from '@/lib/prefs';
import { clearLocal } from '@/lib/progress';
import { BACKDROP_LABELS } from '@/theme/backdrops';
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
  const { theme, backdrop } = useAppTheme();
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  // The leaderboard function holds a verified instructor out of every candidate
  // set until they opt in, and the instructor nav has no Record cell, so the way
  // in lives here. It writes the same flag the Record screen shows.
  const instructor = useQuery({
    queryKey: ['instructor-verification'],
    queryFn: fetchInstructorVerification,
    enabled: session?.source === 'supabase',
  });
  const ranking = useQuery({
    queryKey: ['leaderboard-visibility'],
    queryFn: fetchLeaderboardVisibility,
    enabled: instructor.data === true,
  });
  const setRanking = useMutation({
    mutationFn: setLeaderboardVisibility,
    onSuccess: async (visible) => {
      queryClient.setQueryData(['leaderboard-visibility'], visible);
      await queryClient.invalidateQueries({ queryKey: ['student-leaderboard'] });
    },
  });

  // Ask the function, rather than assert. `study-companion` answers 503 with
  // "not configured yet" when no provider key is set, which is what a local run
  // hits, and this screen used to claim a live model regardless. The same probe
  // the node drawer runs, so the two surfaces cannot disagree.
  const companion = useQuery({
    queryKey: ['study-companion-status'],
    queryFn: () => callEdgeFunction<{ status: string; model?: string }>(
      'study-companion',
      { action: 'status' },
      12_000,
    ),
    enabled: session?.source === 'supabase',
    retry: false,
  });

  const companionDetail = session?.source !== 'supabase'
    ? 'Replies are canned and local. Sign in with Supabase to reach the study model.'
    : companion.isPending
      ? 'Replies here are canned. Checking whether the study model answers…'
      : companion.data?.status === 'online'
        ? `Replies here are canned. Ask AI on a chart node reaches the live ${companion.data.model ?? 'study'} model.`
        : 'Replies here are canned, and that still works. The study model is not answering, so Ask AI on a chart node will fail until it is configured.';

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

  // Sign-out asks first, in a dialog. The label used to swap in place, which is
  // a question nothing announces and nothing blocks: three testers in a row
  // walked away from a shared laptop still signed in.
  const signOut = () => {
    setSignOutOpen(false);
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
            title="Canvas backdrop"
            detail={`${BACKDROP_LABELS[backdrop.id]} sits behind your skill tree. Patterns, or a photo of your own.`}
          >
            <PixelButton
              label="Change"
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

          {/* Only an account the server calls an instructor. `resolveSessionRole`
              promotes on metadata, a verified-instructor row, or an owned
              official course, and never demotes — so a real instructor keeps
              this way in even when they signed in through the student tab. An
              account that said "student" at sign-up never asked to teach, and
              handing it a course-authoring workspace is not a shortcut. */}
          {session?.role === 'instructor' ? (
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
          ) : null}

          {instructor.data === true ? (
            <Row
              title="Rank with the class"
              detail={setRanking.isError
                ? 'That could not be saved. Check your connection and try again.'
                : 'Instructors stay out of course leaderboards by default. Turn this on to rank with learners in courses you do not own.'}
            >
              <Toggle
                label="Rank with the class"
                value={ranking.data === true}
                onChange={(on) => setRanking.mutate(on)}
              />
            </Row>
          ) : null}

          <Row title="Study companion" detail={companionDetail}>
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
            detail={`End the ${session?.role ?? 'current'} session and return to authentication.`}
          >
            <PixelButton
              label="Sign out"
              tone="panel"
              grow={false}
              onPress={() => setSignOutOpen(true)}
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

      {/* `Window` is already a live region, so mounting the dialog announces the
          question, and the modal moves focus onto the safe answer. Escape and
          the hardware back button cancel. No close box: `Window` labels one
          "Close details", which is the wrong sentence to read out here. */}
      <Modal
        visible={signOutOpen}
        animationType={prefs.motionOff ? 'none' : 'fade'}
        presentationStyle="fullScreen"
        onRequestClose={() => setSignOutOpen(false)}
      >
        <View
          style={[styles.dialogScreen, { backgroundColor: t.ground, paddingTop: insets.top }]}
          accessibilityViewIsModal
        >
          <Window title="Sign out?" style={styles.dialog}>
            <PixelText variant="body" colour={t.ink}>
              This ends the {session?.role ?? 'current'} session on this device and clears its
              Supabase tokens. Nothing you have completed is deleted.
            </PixelText>
            <View style={styles.dialogActions}>
              <PixelButton label="Stay signed in" tone="panel" grow={false} onPress={() => setSignOutOpen(false)} />
              <PixelButton label="Sign out" grow={false} onPress={signOut} />
            </View>
          </Window>
        </View>
      </Modal>
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
  dialogScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
  dialog: { width: '100%', maxWidth: 540 },
  dialogActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.cell },
});
