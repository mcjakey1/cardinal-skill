import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
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
import {
  catalogKindForTab,
  playgroundCourses,
  type CourseLibraryTab,
} from '@/features/skilltree/courseLibrary';
import {
  fetchCourseCatalog,
  archiveSharedCourse,
  joinPublishedCourse,
  publishCommunityCourse,
  resolveSharedCourse,
  type CatalogCourse,
  type CommunityVisibility,
} from '@/features/skilltree/courseCatalog';
import { usePrefs } from '@/lib/prefs';
import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { CourseCatalogList } from '@/ui/CourseCatalogList';
import { ReorderableCourseList } from '@/ui/ReorderableCourseList';
import { Window } from '@/ui/Window';
import { PixelButton, PixelInput, PixelText, bevelStyle } from '@/ui/pixel';
import { usePixelTransition } from '@/ui/PixelTransition';

export default function Courses() {
  const t = useTheme();
  const router = useRouter();
  const { share: requestedShareCode } = useLocalSearchParams<{ share?: string }>();
  const queryClient = useQueryClient();
  const { transition } = usePixelTransition();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<CourseLibraryTab>('mine');
  const [ordered, setOrdered] = useState<CourseOption[]>([]);
  const [orderNotice, setOrderNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [catalogNotice, setCatalogNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [joiningCourseId, setJoiningCourseId] = useState<string | null>(null);
  const orderSaveVersion = useRef(0);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['courses'],
    queryFn: fetchCourseOptions,
  });
  const catalogKind = catalogKindForTab(tab);
  const catalog = useQuery({
    queryKey: ['course-catalog', catalogKind],
    queryFn: () => fetchCourseCatalog(catalogKind!),
    enabled: catalogKind !== null,
  });
  const sharedCourse = useQuery({
    queryKey: ['shared-course', requestedShareCode],
    queryFn: () => resolveSharedCourse(requestedShareCode!),
    enabled: Boolean(requestedShareCode),
  });

  useEffect(() => {
    if (requestedShareCode) setTab('community');
  }, [requestedShareCode]);

  useEffect(() => {
    if (!requestedShareCode || sharedCourse.isPending) return;
    if (sharedCourse.error) {
      setCatalogNotice({ text: 'That community invite could not be opened. Check the link and try again.', error: true });
    } else if (!sharedCourse.data) {
      setCatalogNotice({ text: 'That community invite is no longer available.', error: true });
    } else {
      setCatalogNotice({ text: `Invite found · ${sharedCourse.data.title}`, error: false });
    }
  }, [requestedShareCode, sharedCourse.data, sharedCourse.error, sharedCourse.isPending]);

  useEffect(() => {
    if (data) setOrdered(data.filter((course) => !course.isFixture));
  }, [data]);

  const ownedPlaygrounds = useMemo(
    () => playgroundCourses(ordered),
    [ordered],
  );
  const visiblePlaygrounds = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return ownedPlaygrounds;
    return ownedPlaygrounds.filter((course) => (
      course.title.toLocaleLowerCase().includes(needle)
      || course.courseCode?.toLocaleLowerCase().includes(needle)
      || course.term?.toLocaleLowerCase().includes(needle)
    ));
  }, [ownedPlaygrounds, search]);
  const visibleCatalog = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const source = tab === 'community' && sharedCourse.data
      ? [sharedCourse.data, ...(catalog.data ?? []).filter((course) => course.id !== sharedCourse.data?.id)]
      : catalog.data ?? [];
    if (!needle) return source;
    return source.filter((course) => (
      course.title.toLocaleLowerCase().includes(needle)
      || course.courseCode?.toLocaleLowerCase().includes(needle)
      || course.term?.toLocaleLowerCase().includes(needle)
      || course.ownerDisplayName.toLocaleLowerCase().includes(needle)
    ));
  }, [catalog.data, search, sharedCourse.data, tab]);

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

  const share = async (courseId: string, visibility: CommunityVisibility) => {
    try {
      const shareCode = await publishCommunityCourse(courseId, visibility);
      await Promise.all([
        refreshCourses(),
        queryClient.invalidateQueries({ queryKey: ['course-catalog'] }),
      ]);
      AccessibilityInfo.announceForAccessibility('Community sharing updated.');
      return shareCode;
    } catch (cause) {
      throw cause instanceof Error
        ? cause
        : new Error('Community publishing failed. Check your connection and try again.');
    }
  };

  const archive = async (courseId: string) => {
    try {
      await archiveSharedCourse(courseId);
      await Promise.all([
        refreshCourses(),
        queryClient.invalidateQueries({ queryKey: ['course-catalog'] }),
      ]);
      AccessibilityInfo.announceForAccessibility('Shared course archived. Existing learner progress was preserved.');
    } catch {
      throw new Error('The shared course could not be archived. Check your connection and try again.');
    }
  };

  const join = async (course: CatalogCourse) => {
    setJoiningCourseId(course.id);
    setCatalogNotice(null);
    try {
      const joinedCourseId = await joinPublishedCourse(course.id);
      await Promise.all([
        refreshCourses(),
        queryClient.invalidateQueries({ queryKey: ['course-catalog'] }),
      ]);
      AccessibilityInfo.announceForAccessibility(`${course.title} joined.`);
      open(joinedCourseId);
    } catch {
      setCatalogNotice({
        text: `${course.title} could not be joined. Check your connection and try again.`,
        error: true,
      });
      AccessibilityInfo.announceForAccessibility(`${course.title} could not be joined.`);
    } finally {
      setJoiningCourseId(null);
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
          <PixelText variant="title">Courses</PixelText>
          <View style={styles.tabs} accessibilityRole="radiogroup" accessibilityLabel="Course library view">
            <LibraryTab label="My courses" active={tab === 'mine'} onPress={() => setTab('mine')} />
            <LibraryTab label="Playground" active={tab === 'playground'} onPress={() => setTab('playground')} />
            <LibraryTab label="Community" active={tab === 'community'} onPress={() => setTab('community')} />
          </View>
          <PixelInput
            label={tab === 'mine' ? 'Search my courses' : `Search ${tab}`}
            value={search}
            onChangeText={setSearch}
            placeholder={tab === 'mine' ? 'SEARCH MY COURSES...' : `SEARCH ${tab.toUpperCase()}...`}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {tab === 'playground' && orderNotice ? (
            <PixelText variant="body" colour={orderNotice.error ? t.alarm : t.warning}>
              {orderNotice.text}
            </PixelText>
          ) : null}
          {tab !== 'playground' && catalogNotice ? (
            <PixelText variant="body" colour={catalogNotice.error ? t.alarm : t.info}>
              {catalogNotice.text}
            </PixelText>
          ) : null}
        </View>

        <View style={styles.library}>
          {tab === 'playground' && isPending ? (
            <Notice title="Reading Playground">
              <PixelText variant="body" colour={t.inkMuted}>00: OPENING PLAYGROUND</PixelText>
            </Notice>
          ) : tab === 'playground' && error ? (
            <Notice title="Playground unavailable">
              <PixelText variant="body" colour={t.ink}>
                Couldn&apos;t load your Playground courses. Check your connection and try again.
              </PixelText>
              <PixelButton label="Try again" onPress={() => refetch()} />
            </Notice>
          ) : tab === 'playground' ? (
            <ReorderableCourseList
              courses={visiblePlaygrounds}
              activeCourseId={prefs.lastCourseId}
              reduceMotion={prefs.motionOff}
              onOpen={open}
              onReorder={reorder}
              onRename={rename}
              onReset={reset}
              onShare={share}
              onArchive={archive}
              onDuplicate={duplicate}
              onDelete={remove}
              empty={
                <Notice title={search.trim() ? 'No matching Playground courses' : 'Playground is empty'}>
                  <PixelText variant="body" colour={t.ink}>
                    {search.trim()
                      ? 'Try a different course title, code, or term.'
                      : 'Upload a syllabus or start with a blank chart to build privately.'}
                  </PixelText>
                </Notice>
              }
            />
          ) : catalog.isPending ? (
            <Notice title={tab === 'mine' ? 'Reading your courses' : 'Reading community courses'}>
              <PixelText variant="body" colour={t.inkMuted}>OPENING COURSE CATALOG</PixelText>
            </Notice>
          ) : catalog.error ? (
            <Notice title="Catalog unavailable">
              <PixelText variant="body" colour={t.ink}>
                Couldn&apos;t load {tab === 'mine' ? 'instructor courses' : 'the Community catalog'}. Check your connection and try again.
              </PixelText>
              <PixelButton label="Try again" onPress={() => catalog.refetch()} />
            </Notice>
          ) : (
            <CourseCatalogList
              courses={visibleCatalog}
              busyCourseId={joiningCourseId}
              onJoin={join}
              onOpen={(course) => open(course.id)}
              empty={
                <Notice title={search.trim() ? 'No matching courses' : tab === 'mine' ? 'No instructor courses yet' : 'No community courses yet'}>
                  <PixelText variant="body" colour={t.ink}>
                    {search.trim()
                      ? 'Try a different title, code, term, or author.'
                      : tab === 'mine'
                        ? 'Verified instructors have not published a course yet.'
                        : 'Student authors have not published a public course yet.'}
                  </PixelText>
                </Notice>
              }
            />
          )}
        </View>

        {tab === 'playground' ? (
          <View style={styles.actions}>
            <PixelButton label="Upload a syllabus" onPress={goToUpload} />
            <PixelButton label="+ Create blank chart by hand" tone="panel" onPress={createBlank} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function LibraryTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tab,
        bevelStyle(t, active ? 'brand' : 'panel', pressed || active ? 'inset' : 'raised'),
      ]}
    >
      <PixelText variant="micro" colour={active ? t.brandInk : t.inkMuted} numberOfLines={1}>
        {label.toUpperCase()}
      </PixelText>
    </Pressable>
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
  tabs: { flexDirection: 'row', gap: space.xs },
  tab: { minWidth: 0, minHeight: touch, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.cell },
  library: { flex: 1 },
  actions: { paddingHorizontal: space.md, gap: space.cell },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
  notice: { width: '100%', maxWidth: 440 },
});
