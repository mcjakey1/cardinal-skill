import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  deleteCourse,
  duplicateCourse,
  fetchCourseOptions,
  persistCourseOrder,
  resetCourseProgress,
  updateCourseMetadata,
  type CourseMetadata,
  type CourseOption,
} from '@/features/skilltree/courseQueries';
import { mergeVisibleCourseOrder } from '@/features/skilltree/courseOrdering';
import { usePrefs } from '@/lib/prefs';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { ReorderableCourseList } from '@/ui/ReorderableCourseList';
import { Window } from '@/ui/Window';
import { PixelButton, PixelInput, PixelText } from '@/ui/pixel';
import { usePixelTransition } from '@/ui/PixelTransition';

export default function Courses() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { transition } = usePixelTransition();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const [search, setSearch] = useState('');
  const [ordered, setOrdered] = useState<CourseOption[]>([]);
  const [orderNotice, setOrderNotice] = useState<{ text: string; error: boolean } | null>(null);
  const orderSaveVersion = useRef(0);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['courses'],
    queryFn: fetchCourseOptions,
  });

  useEffect(() => {
    if (data) setOrdered(data.filter((course) => !course.isFixture));
  }, [data]);

  const visibleCourses = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return ordered;
    return ordered.filter((course) => (
      course.title.toLocaleLowerCase().includes(needle)
      || course.courseCode?.toLocaleLowerCase().includes(needle)
      || course.term?.toLocaleLowerCase().includes(needle)
    ));
  }, [ordered, search]);

  const open = (id: string, edit = false) => transition(() => router.navigate({
    pathname: '/tree/[courseId]',
    params: edit ? { courseId: id, edit: '1' } : { courseId: id },
  }));

  const refreshCourses = async () => {
    await queryClient.invalidateQueries({ queryKey: ['courses'] });
  };

  const rename = async (courseId: string, metadata: CourseMetadata) => {
    try {
      await updateCourseMetadata(courseId, metadata);
      setOrdered((current) => current.map((course) => course.id === courseId
        ? {
            ...course,
            title: metadata.title,
            courseCode: metadata.courseCode || null,
          }
        : course));
      await refreshCourses();
      AccessibilityInfo.announceForAccessibility('Course renamed.');
    } catch {
      throw new Error('The course could not be renamed. Check your connection and try again.');
    }
  };

  const reset = async (courseId: string) => {
    try {
      await resetCourseProgress(courseId);
      await queryClient.invalidateQueries({ queryKey: ['tree', courseId] });
      AccessibilityInfo.announceForAccessibility('Course progress reset to zero.');
    } catch {
      throw new Error('Progress could not be reset. Check your connection and try again.');
    }
  };

  const duplicate = async (courseId: string) => {
    try {
      const copiedCourseId = await duplicateCourse(courseId);
      await refreshCourses();
      AccessibilityInfo.announceForAccessibility('Editable course copy created.');
      open(copiedCourseId, true);
    } catch {
      throw new Error('The chart copy could not be created. Check your connection and try again.');
    }
  };

  const remove = async (courseId: string) => {
    try {
      await deleteCourse(courseId);
      setOrdered((current) => current.filter((course) => course.id !== courseId));
      if (prefs.lastCourseId === courseId) prefs.set('lastCourseId', null);
      await refreshCourses();
      AccessibilityInfo.announceForAccessibility('Course deleted.');
    } catch {
      throw new Error('The course could not be deleted. Only its owner can delete it.');
    }
  };

  const reorder = (nextVisible: CourseOption[]) => {
    const nextAll = mergeVisibleCourseOrder(ordered, nextVisible);
    const saveVersion = orderSaveVersion.current + 1;
    orderSaveVersion.current = saveVersion;
    setOrdered(nextAll);
    setOrderNotice(null);
    persistCourseOrder(nextAll)
      .then((synced) => {
        if (orderSaveVersion.current !== saveVersion) return;
        if (synced) return;
        setOrderNotice({ text: 'Order saved on this device · cloud sync pending', error: false });
        AccessibilityInfo.announceForAccessibility('Course order saved on this device. Cloud sync is pending.');
      })
      .catch(() => {
        if (orderSaveVersion.current !== saveVersion) return;
        setOrderNotice({ text: 'This device could not save the new order. Try again.', error: true });
        AccessibilityInfo.announceForAccessibility('This device could not save the course order.');
      });
  };

  const goToUpload = () => transition(() => router.navigate('/upload'));
  const createBlank = () => transition(() => router.navigate({ pathname: '/upload', params: { manual: '1' } }));

  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <DitherField variant="quiet" bands={7} flat={prefs.lowBandwidth} />

      <Head>
        <title>Your charts · Cardinal Skill</title>
        <meta name="description" content="Search, reorder, and manage your course charts." />
      </Head>

      <View style={[styles.content, { paddingTop: insets.top + space.cell, paddingBottom: insets.bottom + space.cell }]}>
        <View style={styles.header}>
          <PixelText variant="title">Your charts</PixelText>
          <PixelInput
            label="Search charts"
            value={search}
            onChangeText={setSearch}
            placeholder="SEARCH CHARTS..."
            autoCapitalize="none"
            autoCorrect={false}
          />
          {orderNotice ? (
            <PixelText variant="body" colour={orderNotice.error ? t.alarm : t.warning}>
              {orderNotice.text}
            </PixelText>
          ) : null}
        </View>

        <View style={styles.library}>
          {isPending ? (
            <Notice title="Reading courses">
              <PixelText variant="body" colour={t.inkMuted}>00: OPENING LIBRARY</PixelText>
            </Notice>
          ) : error ? (
            <Notice title="Courses unavailable">
              <PixelText variant="body" colour={t.ink}>
                Couldn&apos;t load your courses. Check your connection and try again.
              </PixelText>
              <PixelButton label="Try again" onPress={() => refetch()} />
            </Notice>
          ) : (
            <ReorderableCourseList
              courses={visibleCourses}
              activeCourseId={prefs.lastCourseId}
              reduceMotion={prefs.motionOff}
              onOpen={open}
              onReorder={reorder}
              onRename={rename}
              onReset={reset}
              onDuplicate={duplicate}
              onDelete={remove}
              empty={
                <Notice title={search.trim() ? 'No matching charts' : 'No charts yet'}>
                  <PixelText variant="body" colour={t.ink}>
                    {search.trim()
                      ? 'Try a different course title, code, or term.'
                      : 'Upload a syllabus or start with a blank chart.'}
                  </PixelText>
                </Notice>
              }
            />
          )}
        </View>

        <View style={styles.actions}>
          <PixelButton label="Upload a syllabus" onPress={goToUpload} />
          <PixelButton label="+ Create blank chart by hand" tone="panel" onPress={createBlank} />
        </View>
      </View>
    </View>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.centred}>
      <Window title={title} style={styles.notice}>{children}</Window>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 820, flex: 1, alignSelf: 'center' },
  header: { paddingHorizontal: space.md, paddingBottom: space.cell, gap: space.cell },
  library: { flex: 1 },
  actions: { paddingHorizontal: space.md, gap: space.cell },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
  notice: { width: '100%', maxWidth: 440 },
});
