import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePrefs, type ThemeChoice } from '@/lib/prefs';
import { clearLocal } from '@/lib/progress';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { Window } from '@/ui/Window';
import { Bevel, Choice, PixelButton, PixelText, Toggle } from '@/ui/pixel';

/**
 * Three, not two. "System" is the default and has to stay reachable, because a
 * student who pins a theme and later changes their phone's schedule should be
 * able to hand the decision back rather than keep re-setting it by hand.
 */
const THEME_OPTIONS: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function System() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);

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
            detail={
              prefs.theme === 'system'
                ? `Following your device, which is currently ${t.scheme}.`
                : `Pinned to ${prefs.theme}, whatever your device is set to.`
            }
          >
            <Choice
              label="Theme"
              value={prefs.theme}
              onChange={(next) => prefs.set('theme', next)}
              options={THEME_OPTIONS}
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
              onPress={() => router.navigate('/profile')}
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
              onPress={() => router.navigate('/instructor')}
            />
          </Row>

          <Row
            title="Study companion"
            detail="A marked prototype. Its answers are canned, and it isn't connected to anything."
          >
            <PixelButton
              label="Open"
              tone="panel"
              grow={false}
              onPress={() => router.navigate('/companion')}
            />
          </Row>
        </Bevel>

        <Window title="This build" live={false}>
          <PixelText variant="body" colour={t.ink}>
            Completions are stored on this device. No account is signed in, so nothing has been
            sent anywhere.
          </PixelText>
          <PixelText variant="body" colour={t.inkMuted}>
            Version {Constants.expoConfig?.version ?? '0.1.0'}
          </PixelText>
        </Window>

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
