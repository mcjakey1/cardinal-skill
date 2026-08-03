import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { palette, space, type } from '@/theme/tokens';

/**
 * Placeholder landing screen. Replace with the auth gate once Supabase Auth is
 * wired: signed in → /courses, signed out → /sign-in.
 */
export default function Index() {
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>CARDINAL SKILL</Text>
      <Text style={styles.display}>Your syllabus, charted.</Text>
      <Text style={styles.body}>
        Upload a course syllabus. Get a skill tree you can actually navigate.
      </Text>
      <Link href="/courses" style={styles.link}>
        Open my charts
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
    backgroundColor: palette.ink,
  },
  eyebrow: { ...type.eyebrow, color: palette.cardinal },
  display: { ...type.display, color: palette.parchment },
  body: { ...type.body, color: palette.haze, maxWidth: 480 },
  link: { ...type.body, color: palette.cardinal, marginTop: space.md },
});
