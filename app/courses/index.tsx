import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { usePixelTransition } from '@/ui/PixelTransition';
import Head from 'expo-router/head';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEMO_COURSE_ID, DEMO_COURSE_TITLE } from '@/features/skilltree/demoTree';
import { fetchCourseOptions } from '@/features/skilltree/courseQueries';
import { usePrefs } from '@/lib/prefs';
import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { Window } from '@/ui/Window';
import { PixelButton, PixelIcon, PixelText, bevelStyle } from '@/ui/pixel';

export default function Courses() {
  const t = useTheme();
  const router = useRouter();
  const { transition } = usePixelTransition();
  const insets = useSafeAreaInsets();
  const { lowBandwidth } = usePrefs();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['courses'],
    queryFn: fetchCourseOptions,
  });

  const open = (id: string) =>
    transition(() => router.navigate({ pathname: '/tree/[courseId]', params: { courseId: id } }));
  const realCourses = data?.filter((course) => course.id !== DEMO_COURSE_ID);

  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <DitherField variant="quiet" bands={7} flat={lowBandwidth} />

      <Head>
        <title>Your charts · Cardinal Skill</title>
        <meta name="description" content="Every course chart you have open." />
      </Head>

      <View style={[styles.header, { paddingTop: insets.top + space.cell }]}>
        <PixelText variant="title">Your charts</PixelText>
      </View>

      {isPending ? (
        <Notice title="Reading courses">
          <PixelText variant="body" colour={t.inkMuted}>
            00: OPENING LIBRARY
          </PixelText>
        </Notice>
      ) : error ? (
        <Notice title="Courses unavailable">
          <PixelText variant="body" colour={t.ink}>
            Couldn&apos;t load your courses. Check your connection and try again.
          </PixelText>
          <PixelButton label="Try again" onPress={() => refetch()} />
          <PixelButton
            label="See an example chart"
            tone="panel"
            onPress={() => open(DEMO_COURSE_ID)}
          />
        </Notice>
      ) : (
        <FlatList
          data={realCourses}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Notice title="No charts yet">
              <PixelText variant="body" colour={t.ink}>
                Upload a syllabus and one gets drawn for you.
              </PixelText>
              <PixelButton label="Upload a syllabus" onPress={() => transition(() => router.navigate('/upload'))} />
              <PixelButton
                label="See an example chart"
                tone="panel"
                onPress={() => open(DEMO_COURSE_ID)}
              />
            </Notice>
          }
          renderItem={({ item, index }) => (
            <CourseCell
              index={index + 1}
              title={item.title}
              term={item.term}
              onPress={() => open(item.id)}
            />
          )}
          /* The empty state already offers both of these; a footer would print
             them twice on the one screen where they matter most. */
          ListFooterComponent={
            realCourses && realCourses.length > 0 ? (
              <View style={styles.footer}>
                <CourseCell
                  index={0}
                  title={DEMO_COURSE_TITLE}
                  term="Example chart"
                  onPress={() => open(DEMO_COURSE_ID)}
                />
                <PixelButton label="Upload a syllabus" onPress={() => transition(() => router.navigate('/upload'))} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

function CourseCell({
  index,
  title,
  term,
  onPress,
}: {
  index: number;
  title: string;
  term: string | null;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={term ? `${title}, ${term}` : title}
      style={({ pressed }) => [styles.cell, bevelStyle(t, 'panel', pressed ? 'inset' : 'raised')]}
    >
      <View style={styles.cellIndex}>
        <PixelText variant="micro" colour={t.inkMuted}>
          {String(index).padStart(2, '0')}
        </PixelText>
      </View>
      <View style={styles.cellBody}>
        <PixelText variant="body" numberOfLines={1}>
          {title}
        </PixelText>
        {term ? (
          <PixelText variant="micro" colour={t.inkMuted}>
            {term.toUpperCase()}
          </PixelText>
        ) : null}
      </View>
      <PixelIcon name="play" size={12} colour={t.brand} />
    </Pressable>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.centred}>
      <Window title={title} style={styles.notice}>
        {children}
      </Window>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: space.md, paddingBottom: space.cell },
  list: { padding: space.md, gap: space.cell },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
  notice: { width: '100%', maxWidth: 420 },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: touch + space.md,
    paddingHorizontal: space.md,
  },
  cellIndex: { minWidth: 24 },
  cellBody: { flex: 1, gap: space.hair },
  footer: { gap: space.cell, marginTop: space.md },
});
