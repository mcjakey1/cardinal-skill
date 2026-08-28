import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthContext';
import { achievements, streakDays } from '@/features/skilltree/achievements';
import { fetchInstructorVerification } from '@/features/skilltree/courseCatalog';
import { fetchCourseOptions } from '@/features/skilltree/courseQueries';
import { LeaderboardStickyBar } from '@/features/skilltree/LeaderboardList';
import { LeaderboardView } from '@/features/skilltree/LeaderboardView';
import { effectiveMissionCompletionIds } from '@/features/skilltree/missions';
import { PlayerStats } from '@/features/skilltree/PlayerStats';
import {
  activityPunchCard,
  completionEstimateDays,
  nodesPerWeek,
  playerTitle,
} from '@/features/skilltree/recordAnalytics';
import { RecordHeader, type RecordView } from '@/features/skilltree/RecordHeader';
import {
  fetchLeaderboard,
  fetchLeaderboardVisibility,
  fetchRecordEvents,
  setLeaderboardVisibility,
} from '@/features/skilltree/recordQueries';
import { XP_PER_LEVEL, levelForXp, levelProgress, totalXp } from '@/features/skilltree/progression';
import { fetchLiveTree, treeQueryKeys } from '@/features/skilltree/queries';
import { rollUpProgress } from '@/features/skilltree/rollup';
import { StampsList } from '@/features/skilltree/StampsList';
import type { Tree } from '@/features/skilltree/types';
import { usePrefs } from '@/lib/prefs';
import { useMultiCourseProgress } from '@/lib/progress';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { StableScrollView } from '@/ui/StableScrollView';
import { usePixelTransition } from '@/ui/PixelTransition';
import { Window } from '@/ui/Window';
import { Bevel, PixelButton, PixelText } from '@/ui/pixel';

export default function Record() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { transition } = usePixelTransition();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const { view: requestedView, reset: viewReset } = useLocalSearchParams<{ view?: string; reset?: string }>();
  const [scopeId, setScopeId] = useState(prefs.lastCourseId ?? 'all');
  const [view, setView] = useState<RecordView>('dossier');

  useEffect(() => {
    if (requestedView === 'dossier') setView('dossier');
  }, [requestedView, viewReset]);

  const { data: courses = [], isPending: coursesPending } = useQuery({
    queryKey: ['courses'],
    queryFn: fetchCourseOptions,
  });
  const selectedCourse = courses.find((course) => course.id === scopeId);
  const globalCourses = useMemo(() => {
    const live = courses.filter((course) => !course.isFixture);
    return live.length > 0 ? live : courses;
  }, [courses]);
  const scopedCourses = useMemo(() => scopeId === 'all'
    ? globalCourses
    : selectedCourse ? [selectedCourse] : [], [globalCourses, scopeId, selectedCourse]);
  const activeCourseIds = useMemo(() => scopedCourses.map((course) => course.id), [scopedCourses]);

  useEffect(() => {
    if (scopeId !== 'all' && courses.length > 0 && !courses.some((course) => course.id === scopeId)) {
      setScopeId(globalCourses[0]?.id ?? 'all');
    }
  }, [courses, globalCourses, scopeId]);

  const treeQueries = useQueries({
    queries: activeCourseIds.map((courseId) => ({
      queryKey: treeQueryKeys.live(courseId),
      queryFn: () => fetchLiveTree(courseId),
    })),
  });
  const { logs, ready: progressReady } = useMultiCourseProgress(activeCourseIds);
  const signedInLive = session?.source === 'supabase';
  const liveScope = scopeId === 'all' || Boolean(selectedCourse && !selectedCourse.isFixture);
  const recordRemoteEnabled = signedInLive && liveScope;
  const remoteCourseId = scopeId === 'all' ? null : scopeId;
  const leaderboardAvailable = Boolean(
    signedInLive
      && scopeId !== 'all'
      && selectedCourse
      && !selectedCourse.isFixture
      && !selectedCourse.canEdit
      && (selectedCourse.kind === 'official' || selectedCourse.kind === 'community')
      && (selectedCourse.publicationStatus === 'published'
        || selectedCourse.publicationStatus === 'archived'),
  );
  const leaderboardUnavailable = useMemo(() => {
    if (!signedInLive) return {
      title: 'Sign in for live rankings',
      message: 'Leaderboards use your signed-in student account and never invent classmates.',
    };
    if (scopeId === 'all') return {
      title: 'Choose one course leaderboard',
      message: 'XP from different courses is never combined. Select an official or student-made course above.',
    };
    if (selectedCourse?.isFixture || selectedCourse?.kind === 'practice') return {
      title: 'No live ladder for Playground courses',
      message: 'Private Playground progress stays personal and never enters a competitive ranking.',
    };
    if (selectedCourse?.canEdit) return {
      title: 'Authors do not enter learner rankings',
      message: 'Course authors can edit content and inspect participation, but cannot compete against their learners.',
    };
    return {
      title: 'Leaderboard opens after publication',
      message: 'This course needs to be published before enrolled students can join its isolated ladder.',
    };
  }, [scopeId, selectedCourse, signedInLive]);

  const leaderboardQuery = useQuery({
    queryKey: ['student-leaderboard', remoteCourseId],
    queryFn: () => fetchLeaderboard(remoteCourseId),
    enabled: leaderboardAvailable,
  });
  const eventsQuery = useQuery({
    queryKey: ['record-events', remoteCourseId],
    queryFn: () => fetchRecordEvents(remoteCourseId),
    enabled: recordRemoteEnabled,
  });
  const visibilityQuery = useQuery({
    queryKey: ['leaderboard-visibility'],
    queryFn: fetchLeaderboardVisibility,
    enabled: signedInLive,
  });
  // The leaderboard function leaves a verified instructor out of the candidate
  // set until they opt in, so the control has to say that to the right people.
  const instructorQuery = useQuery({
    queryKey: ['instructor-verification'],
    queryFn: fetchInstructorVerification,
    enabled: signedInLive,
  });
  const visibilityMutation = useMutation({
    mutationFn: setLeaderboardVisibility,
    onSuccess: async (visible) => {
      queryClient.setQueryData(['leaderboard-visibility'], visible);
      await queryClient.invalidateQueries({ queryKey: ['student-leaderboard'] });
    },
  });

  const dossier = useMemo(() => {
    const combinedTree: Tree = { nodes: [], prereqs: [] };
    const masteredIds: string[] = [];
    const masteryAt = new Map<string, string>();
    const activityTimestamps: string[] = [];
    let xp = 0;

    treeQueries.forEach((query, index) => {
      const data = query.data;
      const courseId = activeCourseIds[index];
      if (!data || !courseId) return;
      const local = logs[courseId] ?? { nodes: {}, missions: {}, missionUnmarks: {} };
      const rolled = rollUpProgress({
        tree: data.tree,
        missions: data.missions,
        completedMissionIds: effectiveMissionCompletionIds(
          data.completedMissionIds,
          Object.keys(local.missions),
          Object.keys(local.missionUnmarks),
        ),
        serverCompletedMissionIds: data.completedMissionIds,
        directlyCompletedIds: Object.keys(local.nodes),
        serverMasteredIds: data.masteredIds,
        serverXp: data.xp,
      });
      xp += rolled.xp;
      combinedTree.nodes.push(...data.tree.nodes);
      combinedTree.prereqs.push(...data.tree.prereqs);
      masteredIds.push(...rolled.masteredIds);
      activityTimestamps.push(...Object.values(local.nodes), ...Object.values(local.missions));

      rolled.masteredIds.forEach((nodeId) => {
        const localTimes = [
          local.nodes[nodeId],
          ...data.missions.filter((mission) => mission.skillId === nodeId).map((mission) => local.missions[mission.id]),
        ].filter((timestamp): timestamp is string => Boolean(timestamp));
        const latest = localTimes.sort().at(-1);
        if (latest) masteryAt.set(`${courseId}:${nodeId}`, latest);
      });
    });

    for (const event of eventsQuery.data ?? []) {
      activityTimestamps.push(event.completedAt);
      const key = `${event.courseId}:${event.nodeId}`;
      const current = masteryAt.get(key);
      if (!current || event.completedAt > current) masteryAt.set(key, event.completedAt);
    }

    const masteredSet = new Set(masteredIds);
    const masteredTimestamps = [...masteryAt.entries()]
      .filter(([key]) => masteredSet.has(key.slice(key.indexOf(':') + 1)))
      .map(([, timestamp]) => timestamp);
    const velocity = nodesPerWeek(masteredTimestamps);
    const totalNodes = combinedTree.nodes.length;
    return {
      tree: combinedTree,
      masteredIds: [...masteredSet],
      xp,
      totalNodes,
      availableXp: totalXp(combinedTree.nodes),
      streak: streakDays(activityTimestamps),
      activity: activityPunchCard(activityTimestamps),
      velocity,
      estimatedDays: completionEstimateDays(Math.max(0, totalNodes - masteredSet.size), velocity),
    };
  }, [activeCourseIds, eventsQuery.data, logs, treeQueries]);

  const currentRank = leaderboardQuery.data?.find((entry) => entry.isCurrentUser) ?? null;
  const level = levelForXp(dossier.xp);
  const stamps = achievements(dossier.tree, dossier.masteredIds, dossier.streak);
  const pending = coursesPending || treeQueries.some((query) => query.isPending) || !progressReady;
  const treeFailed = treeQueries.some((query) => query.isError);
  const scopeTitle = scopeId === 'all'
    ? 'Global record'
    : [selectedCourse?.courseCode, selectedCourse?.title].filter(Boolean).join(' · ') || 'Record';

  if (!coursesPending && courses.length === 0) {
    return (
      <Shell insets={insets.top} flat={prefs.lowBandwidth}>
        <Window title="No record yet">
          <PixelText variant="body" colour={t.ink}>
            Open a chart and clear a node. What you finish is recorded here.
          </PixelText>
          <PixelButton label="Open my charts" onPress={() => transition(() => router.navigate('/courses'))} />
        </Window>
      </Shell>
    );
  }

  return (
    <Shell
      insets={insets.top}
      flat={prefs.lowBandwidth}
      title={`${scopeTitle} · Cardinal Skill`}
      description={`${dossier.masteredIds.length} of ${dossier.totalNodes} nodes cleared across ${scopeTitle}.`}
      overlay={view === 'leaderboard' && currentRank && currentRank.rank > 3
        ? <LeaderboardStickyBar entry={currentRank} />
        : null}
    >
      <View style={styles.intro}>
        <PixelText variant="title">Record</PixelText>
        <PixelText variant="body" colour={t.inkMuted}>
          Compare the ladder or inspect the work your progress has built.
        </PixelText>
      </View>

      <RecordHeader
        scopeId={scopeId}
        courses={courses}
        view={view}
        onScopeChange={(next) => {
          setScopeId(next);
          if (next !== 'all') prefs.set('lastCourseId', next);
        }}
        onViewChange={setView}
      />

      {pending ? (
        <Window title="Reading record" live={false}>
          <PixelText variant="body" colour={t.inkMuted}>COUNTING CLEARED WORK</PixelText>
        </Window>
      ) : treeFailed ? (
        <Window title="Record unavailable">
          <PixelText variant="body" colour={t.ink}>
            The record could not be loaded. Check your connection and try again.
          </PixelText>
        </Window>
      ) : (
        <>
          {recordRemoteEnabled && eventsQuery.isError ? (
            <Bevel tone="panel" style={[styles.syncError, { borderColor: t.alarm }]}>
              <View style={styles.syncErrorCopy}>
                <PixelText variant="label" colour={t.alarm}>Activity sync unavailable</PixelText>
                <PixelText variant="micro" colour={t.inkMuted}>
                  Local activity is shown, but server history may be incomplete.
                </PixelText>
              </View>
              <PixelButton label="Retry activity" tone="panel" grow={false} onPress={() => void eventsQuery.refetch()} />
            </Bevel>
          ) : null}
          <Animated.View key={view} entering={prefs.motionOff ? undefined : FadeIn.duration(180)}>
            {view === 'leaderboard' ? (
              <LeaderboardView
                entries={leaderboardQuery.data ?? []}
                pending={leaderboardQuery.isPending && leaderboardAvailable}
                error={leaderboardQuery.isError}
                available={leaderboardAvailable}
                courseKind={selectedCourse?.kind ?? null}
                unavailableTitle={leaderboardUnavailable.title}
                unavailableMessage={leaderboardUnavailable.message}
                visibility={signedInLive ? visibilityQuery.data : null}
                isInstructor={instructorQuery.data === true}
                visibilityPending={visibilityMutation.isPending || visibilityQuery.isPending}
                visibilityError={visibilityQuery.isError}
                onVisibilityChange={(visible) => visibilityMutation.mutate(visible)}
                onVisibilityRetry={() => void visibilityQuery.refetch()}
                onRetry={() => void leaderboardQuery.refetch()}
              />
            ) : (
              <View style={styles.dossier}>
              <PlayerStats
                level={level}
                title={playerTitle(level)}
                xp={dossier.xp}
                availableXp={dossier.availableXp}
                levelProgress={levelProgress(dossier.xp, XP_PER_LEVEL)}
                mastered={dossier.masteredIds.length}
                totalNodes={dossier.totalNodes}
                streak={dossier.streak}
                rank={currentRank?.rank ?? null}
                participants={currentRank?.participantCount ?? 0}
                rankLabel={scopeId === 'all' ? 'Global rank' : 'Course rank'}
                activity={dossier.activity}
                velocity={dossier.velocity}
                estimatedDays={dossier.estimatedDays}
              />
              <StampsList stamps={stamps} />
              </View>
            )}
          </Animated.View>
        </>
      )}

      {visibilityMutation.isError ? (
        <PixelText variant="micro" colour={t.alarm}>
          Leaderboard visibility could not be changed. Check your connection and try again.
        </PixelText>
      ) : null}

    </Shell>
  );
}

function Shell({
  insets,
  flat,
  title = 'Record · Cardinal Skill',
  description = 'Your progress dossier and opt-in course leaderboards.',
  overlay,
  children,
}: {
  insets: number;
  flat: boolean;
  title?: string;
  description?: string;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
      </Head>
      <DitherField variant="quiet" bands={7} flat={flat} />
      <StableScrollView
        showsVerticalScrollIndicator
        contentContainerStyle={[styles.body, { paddingTop: insets + space.cell }]}
      >
        {children}
      </StableScrollView>
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: space.md, paddingRight: space.lg, paddingBottom: 120, gap: space.md },
  intro: { gap: space.xs },
  dossier: { gap: space.md },
  syncError: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md, padding: space.md },
  syncErrorCopy: { minWidth: 0, flex: 1, gap: space.xs },
});
