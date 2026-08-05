import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEMO_COURSE_ID } from '@/features/skilltree/demoTree';
import { usePrefs } from '@/lib/prefs';
import { lms } from '@/theme/lms';
import { motion, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { Window } from '@/ui/Window';
import { PixelButton, PixelInput, PixelText } from '@/ui/pixel';
import { Field, LButton, LText, Notice, Panel } from '@/ui/lms';

/**
 * The front door: two doors, side by side.
 *
 * Cardinal Skill is two designs on purpose. A student gets a sixteen-colour
 * screen they are clearing; an instructor gets a workspace that behaves like the
 * LMS they already have open in another tab. Asking "student or instructor?" as
 * a dropdown on one neutral form would hide that, and would drop half the people
 * who arrive here into a world that was not built for them.
 *
 * So the seam is the screen. Each door is drawn in the grammar of the surface it
 * opens, and choosing is looking rather than reading.
 *
 * **Neither door is authentication.** Nothing behind either one is unlocked by
 * getting through it: student progress is local to the device or scoped by RLS
 * to an account that does not exist yet, and every instructor figure comes from
 * a security-definer function gated on `auth.uid()`. Both doors say so in as
 * many words, because a password box that quietly cannot fail is exactly the
 * theatre this app is written not to repeat. When real auth lands, these two
 * forms are what it replaces.
 */

const BOOT = [
  '00: CHART ENGINE READY',
  '01: LOCAL RECORD MOUNTED',
  '02: NO ACCOUNT SIGNED IN',
] as const;

/**
 * The instructor door's username and password.
 *
 * Compiled into the bundle, printed on the screen beside the fields, and
 * therefore keeping nobody out — which is the property that makes it safe to
 * ship. It is a gate on a *layout*, not on data: everything behind it is either
 * a fixture in this repository or a query that returns nothing without a real
 * session.
 */
const INSTRUCTOR_USER = 'admin';
const INSTRUCTOR_PASSWORD = '1234';

export default function Index() {
  const { width } = useWindowDimensions();
  // Two full-height doors need room for both. Below this they stack, student
  // first, because a phone is overwhelmingly a student's device.
  const wide = width >= 900;

  return (
    <View style={styles.screen}>
      <Head>
        <title>Cardinal Skill</title>
        <meta
          name="description"
          content="Your syllabus, drawn as the chart it always was: what depends on what, what is open to you now, and what you have already cleared."
        />
        <meta property="og:title" content="Cardinal Skill" />
        <meta
          property="og:description"
          content="Your syllabus, drawn as the chart it always was: what depends on what, what is open to you now, and what you have already cleared."
        />
      </Head>

      {wide ? (
        <View style={styles.row}>
          <StudentDoor wide />
          <InstructorDoor wide />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.stack}>
          <StudentDoor wide={false} />
          <InstructorDoor wide={false} />
        </ScrollView>
      )}
    </View>
  );
}

// ------------------------------------------------------------- student door

function StudentDoor({ wide }: { wide: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { motionOff, lowBandwidth, set } = usePrefs();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(motionOff ? BOOT.length : 0);

  useEffect(() => {
    if (motionOff) {
      setShown(BOOT.length);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= BOOT.length) clearInterval(id);
    }, motion.quick * 2);
    return () => clearInterval(id);
  }, [motionOff]);

  const enter = () => {
    set('role', 'student');
    router.navigate({ pathname: '/tree/[courseId]', params: { courseId: DEMO_COURSE_ID } });
  };

  return (
    <Door wide={wide} style={{ backgroundColor: t.ground }}>
      <DitherField bands={11} flat={lowBandwidth} />
      <View style={[styles.doorBody, { paddingTop: insets.top + space.lg }]}>
        <PixelText variant={wide ? 'hero' : 'display'}>Cardinal Skill</PixelText>
        <PixelText variant="body" colour={t.ink} style={styles.lede}>
          Your syllabus, drawn as the chart it always was: what depends on what, what&apos;s open to
          you right now, and what you&apos;ve already cleared.
        </PixelText>

        <Window title="System" live={false}>
          {BOOT.map((line, i) => (
            <PixelText
              key={line}
              variant="body"
              colour={i === BOOT.length - 1 ? t.inkMuted : t.info}
              style={{ opacity: i < shown ? 1 : 0 }}
            >
              {line}
            </PixelText>
          ))}
        </Window>

        <Window title="Student sign-in">
          <PixelInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@school.edu"
          />
          <PixelInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="••••••"
          />
          <PixelButton label="Sign in as a student" onPress={enter} />
          <PixelText variant="micro" colour={t.inkMuted}>
            STUDENT ACCOUNTS ARE NOT WIRED YET. ANY DETAILS OPEN THE EXAMPLE CHART, AND YOUR PROGRESS
            STAYS ON THIS DEVICE.
          </PixelText>
        </Window>
      </View>
    </Door>
  );
}

// ---------------------------------------------------------- instructor door

function InstructorDoor({ wide }: { wide: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { set } = usePrefs();

  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState(false);

  const enter = () => {
    if (user.trim().toLowerCase() !== INSTRUCTOR_USER || password !== INSTRUCTOR_PASSWORD) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setPassword('');
    set('role', 'instructor');
    router.navigate('/instructor');
  };

  return (
    <Door wide={wide} style={styles.instructorGround}>
      {/* Stacked, this door is the second one down: the status-bar inset belongs
          to the student door above it, not here. */}
      <View style={[styles.doorBody, { paddingTop: (wide ? insets.top : 0) + lms.space.xl }]}>
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <LText variant="section" tone="onBrand">
              C
            </LText>
          </View>
          <LText variant="small" tone="muted">
            Instructor workspace
          </LText>
        </View>

        <LText variant="page">Teach the course you already wrote</LText>
        <LText variant="body" tone="muted" style={styles.prose}>
          Import a syllabus, check the tree it draws, and read where the class actually is — in a
          workspace that works the way the rest of your week does.
        </LText>

        <Panel>
          <View style={styles.panelBody}>
            <LText variant="section">Sign in</LText>

            <Field label="Username" value={user} onChangeText={setUser} placeholder="admin" />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="1234"
            />

            {failed ? (
              <Notice tone="error" title="That is not the workspace username and password">
                Use {INSTRUCTOR_USER} and {INSTRUCTOR_PASSWORD}, printed below because this gate is
                not keeping anything in.
              </Notice>
            ) : null}

            <LButton label="Open the workspace" variant="primary" onPress={enter} />

            <Notice title={`Username ${INSTRUCTOR_USER} · password ${INSTRUCTOR_PASSWORD}`}>
              Accounts are not wired yet. This opens the instructor layout and unlocks no data:
              class figures still come from a database function gated on a signed-in account, and
              anything shown without one is labelled as sample data.
            </Notice>
          </View>
        </Panel>
      </View>
    </Door>
  );
}

// ------------------------------------------------------------------- shared

/**
 * One door.
 *
 * On a wide screen each door is a full-height column that scrolls on its own; on
 * a phone they stack inside one scroll view, and a nested scroll view there
 * would fight the outer one for the same gesture.
 */
function Door({
  wide,
  style,
  children,
}: {
  wide: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (!wide) return <View style={[styles.doorStacked, style]}>{children}</View>;
  return (
    <View style={[styles.door, style]}>
      <ScrollView contentContainerStyle={styles.doorScroll}>{children}</ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: lms.colour.ground },
  row: { flex: 1, flexDirection: 'row' },
  stack: { flexGrow: 1 },

  door: { flex: 1 },
  doorScroll: { flexGrow: 1 },
  doorStacked: { minHeight: 520 },
  doorBody: {
    flex: 1,
    padding: space.md,
    gap: space.md,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: space.xl,
  },
  lede: { maxWidth: 420 },

  instructorGround: { backgroundColor: lms.colour.ground },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: lms.space.md },
  mark: {
    width: 30,
    height: 30,
    borderRadius: lms.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lms.colour.brand,
  },
  prose: { maxWidth: 420 },
  panelBody: { padding: lms.space.lg, gap: lms.space.md },
});
