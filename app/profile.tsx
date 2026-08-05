import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EMPTY_PROFILE,
  validateProfile,
  type ProfileErrors,
} from '@/features/skilltree/profile';
import type { StudentProfile, StudyPace } from '@/features/skilltree/types';
import { usePrefs } from '@/lib/prefs';
import { createStore } from '@/lib/store';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { Window } from '@/ui/Window';
import { Choice, PixelButton, PixelIcon, PixelInput, PixelText } from '@/ui/pixel';

/**
 * Who the student is.
 *
 * Read-only until they ask to edit it, because this screen is opened to check a
 * detail far more often than to change one, and a form that is always live
 * invites a typo nobody meant to make.
 *
 * Stored on the device. `profiles` exists in 0001_init.sql with an owner-only
 * policy, so this is the offline half of a real table rather than a stand-in for
 * one — it moves when there is a session to move it with.
 */

const PACES: { value: StudyPace; label: string }[] = [
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'intense', label: 'Intense' },
];

const PACE_COPY: Record<StudyPace, string> = {
  relaxed: 'Fewer, larger sessions. Nothing chases you.',
  balanced: 'A steady amount most days.',
  intense: 'Bigger targets and a faster streak.',
};

const profileStore = createStore<StudentProfile>(
  AsyncStorage,
  'cardinal.profile.v1',
  1,
  EMPTY_PROFILE,
);

const FIELDS: {
  key: keyof StudentProfile;
  label: string;
  placeholder: string;
  optional?: boolean;
}[] = [
  { key: 'fullName', label: 'Full name', placeholder: 'Ada Lovelace' },
  { key: 'email', label: 'Email', placeholder: 'ada@example.edu' },
  { key: 'studentNumber', label: 'Student number', placeholder: 'S1234567' },
  { key: 'program', label: 'Program', placeholder: 'Mathematics', optional: true },
  { key: 'yearLevel', label: 'Year', placeholder: 'Second year', optional: true },
  { key: 'campus', label: 'Campus', placeholder: 'Main campus', optional: true },
];

export default function Profile() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lowBandwidth } = usePrefs();

  const [profile, setProfile] = useState<StudentProfile>(EMPTY_PROFILE);
  const [draft, setDraft] = useState<StudentProfile>(EMPTY_PROFILE);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    profileStore.load().then((loaded) => {
      if (!live) return;
      setProfile(loaded);
      setDraft(loaded);
      setReady(true);
      // Nothing filled in yet is a first run, so the form opens rather than
      // showing a screen of blanks with an Edit button on it.
      if (!loaded.fullName) setEditing(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const set = (key: keyof StudentProfile, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    // Errors clear as the field is corrected, but none appear until Save: a
    // message under a field someone is still typing into is just noise.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const save = async () => {
    const found = validateProfile(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const trimmed: StudentProfile = {
      ...draft,
      fullName: draft.fullName.trim(),
      email: draft.email.trim(),
      studentNumber: draft.studentNumber.trim(),
      program: draft.program.trim(),
      yearLevel: draft.yearLevel.trim(),
      campus: draft.campus.trim(),
    };

    await profileStore.save(trimmed);
    setProfile(trimmed);
    setDraft(trimmed);
    setEditing(false);
    setSaved(true);
  };

  if (!ready) {
    return (
      <Shell insets={insets.top} flat={lowBandwidth}>
        <Window title="Reading profile" live={false}>
          <PixelText variant="body" colour={t.inkMuted}>
            00: OPENING RECORD
          </PixelText>
        </Window>
      </Shell>
    );
  }

  return (
    <Shell insets={insets.top} flat={lowBandwidth}>
      <Head>
        <title>Profile · Cardinal Skill</title>
      </Head>

      <PixelText variant="title">Profile</PixelText>
      <PixelText variant="body" colour={t.inkMuted}>
        Saved on this device. Nothing here is sent anywhere yet.
      </PixelText>

      {saved ? (
        <View style={styles.savedRow}>
          <PixelIcon name="check" size={16} colour={t.earnedText} />
          <PixelText variant="label" colour={t.earnedText}>
            Profile saved
          </PixelText>
        </View>
      ) : null}

      {editing ? (
        <>
          {FIELDS.map((field) => (
            <View key={field.key} style={styles.field}>
              <PixelInput
                label={field.optional ? `${field.label} (optional)` : field.label}
                value={String(draft[field.key])}
                onChangeText={(value) => set(field.key, value)}
                placeholder={field.placeholder}
                autoCapitalize={field.key === 'email' ? 'none' : 'words'}
                keyboardType={field.key === 'email' ? 'email-address' : 'default'}
              />
              {errors[field.key] ? (
                <PixelText variant="micro" colour={t.alarm}>
                  {errors[field.key]}
                </PixelText>
              ) : null}
            </View>
          ))}

          <View style={styles.field}>
            <PixelText variant="micro" colour={t.inkMuted}>
              STUDY PACE
            </PixelText>
            <Choice
              value={draft.studyPace}
              options={PACES}
              onChange={(value) => set('studyPace', value)}
              label="Study pace"
            />
            <PixelText variant="micro" colour={t.inkMuted}>
              {PACE_COPY[draft.studyPace]}
            </PixelText>
          </View>

          <View style={styles.actions}>
            <PixelButton label="Save profile" onPress={save} />
            {profile.fullName ? (
              <PixelButton
                tone="panel"
                label="Cancel"
                onPress={() => {
                  setDraft(profile);
                  setErrors({});
                  setEditing(false);
                }}
              />
            ) : null}
          </View>
        </>
      ) : (
        <>
          <Window title={profile.fullName || 'Not filled in'} live={false}>
            {FIELDS.filter((f) => f.key !== 'fullName').map((field) => (
              <View key={field.key} style={styles.readRow}>
                <PixelText variant="micro" colour={t.inkMuted}>
                  {field.label.toUpperCase()}
                </PixelText>
                <PixelText variant="body" colour={profile[field.key] ? t.ink : t.inkMuted}>
                  {String(profile[field.key]) || 'Not given'}
                </PixelText>
              </View>
            ))}
            <View style={styles.readRow}>
              <PixelText variant="micro" colour={t.inkMuted}>
                STUDY PACE
              </PixelText>
              <PixelText variant="body" colour={t.ink}>
                {PACES.find((p) => p.value === profile.studyPace)?.label}
              </PixelText>
            </View>
          </Window>

          <View style={styles.actions}>
            <PixelButton
              label="Edit profile"
              onPress={() => {
                setDraft(profile);
                setSaved(false);
                setEditing(true);
              }}
            />
          </View>
        </>
      )}

      <PixelButton label="Back" tone="panel" onPress={() => router.back()} />
    </Shell>
  );
}

function Shell({
  insets,
  flat,
  children,
}: {
  insets: number;
  flat: boolean;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <DitherField flat={flat} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets + space.cell }]}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  body: { padding: space.md, gap: space.md, maxWidth: 560, width: '100%', alignSelf: 'center', paddingBottom: space.xxl },
  field: { gap: space.xs },
  readRow: { gap: space.hair },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: space.cell },
  actions: { gap: space.cell, marginTop: space.cell },
});
