import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EditMissionModal } from '@/features/skilltree/EditMissionModal';
import { MissionCard } from '@/features/skilltree/MissionCard';
import { MissionsHeader } from '@/features/skilltree/MissionsHeader';
import { PrimaryObjectiveCard } from '@/features/skilltree/PrimaryObjectiveCard';
import { fetchCourseOptions } from '@/features/skilltree/courseQueries';
import {
  filterMissionRows,
  groupMissionRows,
  nextRecommendedMission,
  sortMissionRows,
  type MissionBoardRow,
  type MissionFilter,
  type MissionModule,
  type MissionSort,
} from '@/features/skilltree/missionBoard';
import { applyMissionUpdate, type MissionUpdate } from '@/features/skilltree/missionEditing';
import { persistMissionUpdate, synchronizeEditedMission } from '@/features/skilltree/missionMutations';
import { effectiveMissionCompletionIds, missionStates } from '@/features/skilltree/missions';
import { deriveStatuses } from '@/features/skilltree/progression';
import { fetchMissionBoardTree, type TreeSnapshot } from '@/features/skilltree/queries';
import { rollUpProgress } from '@/features/skilltree/rollup';
import { usePrefs } from '@/lib/prefs';
import { useMultiCourseProgress } from '@/lib/progress';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { StableScrollView } from '@/ui/StableScrollView';
import { usePixelTransition } from '@/ui/PixelTransition';
import { Window } from '@/ui/Window';
import { Bevel, Meter, PixelIcon, PixelText, bevelStyle } from '@/ui/pixel';

export default function Missions() {
  const { transition } = usePixelTransition();
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const [courseId, setCourseId] = useState<string>('');
  const [sort, setSort] = useState<MissionSort>('curriculum');
  const [filter, setFilter] = useState<MissionFilter>('open');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [editing, setEditing] = useState<MissionBoardRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const claimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const courseSelectionTouched = useRef(false);

  const { data: courses = [], isPending: coursesPending } = useQuery({
    queryKey: ['courses'],
    queryFn: fetchCourseOptions,
  });
  const visibleCourseIds = useMemo(
    () => courseId === 'all' ? courses.map((course) => course.id) : courseId ? [courseId] : [],
    [courseId, courses],
  );
  const treeQueries = useQueries({
    queries: visibleCourseIds.map((id) => ({
      queryKey: ['tree', id],
      queryFn: () => fetchMissionBoardTree(id),
    })),
  });
  const { logs, ready: progressReady, toggleMission } = useMultiCourseProgress(visibleCourseIds);

  useEffect(() => () => {
    if (claimTimer.current) clearTimeout(claimTimer.current);
  }, []);

  useEffect(() => {
    if (!courseId && courses.length > 0) {
      setCourseId(prefs.lastCourseId && courses.some((course) => course.id === prefs.lastCourseId)
        ? prefs.lastCourseId
        : courses[0]!.id);
    } else if (courseId !== 'all' && courses.length > 0 && !courses.some((course) => course.id === courseId)) {
      setCourseId(courses[0]!.id);
    }
  }, [courseId, courses, prefs.lastCourseId]);

  useEffect(() => {
    if (!courseSelectionTouched.current && prefs.lastCourseId) setCourseId(prefs.lastCourseId);
  }, [prefs.lastCourseId]);

  const rows = useMemo<MissionBoardRow[]>(() => treeQueries.flatMap((query, courseOrder) => {
    const data = query.data;
    const selectedCourse = courses.find((course) => course.id === visibleCourseIds[courseOrder]);
    if (!data || !selectedCourse) return [];
    const local = logs[selectedCourse.id] ?? { nodes: {}, missions: {}, missionUnmarks: {} };
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
    const { status } = deriveStatuses(data.tree, rolled.masteredIds);
    const nodeById = new Map(data.tree.nodes.map((node) => [node.id, node] as const));
    const completed = new Set(rolled.masteredIds);

    return data.tree.nodes.flatMap((node) => {
      const missingPrerequisites = data.tree.prereqs
        .filter((edge) => edge.nodeId === node.id && !completed.has(edge.prereqId))
        .map((edge) => nodeById.get(edge.prereqId)?.title)
        .filter((title): title is string => Boolean(title));
      return missionStates(
        data.missions,
        node.id,
        rolled.completedMissionIds,
        status.get(node.id) !== 'locked',
      ).map(({ mission, state }) => ({
        courseId: selectedCourse.id,
        courseTitle: [selectedCourse.courseCode, data.title, selectedCourse.term].filter(Boolean).join(' · '),
        courseOrder,
        mission,
        missionOrder: data.missions.findIndex((item) => item.id === mission.id),
        node,
        state,
        missingPrerequisites,
      }));
    });
  }), [courses, logs, treeQueries, visibleCourseIds]);

  const counts = useMemo<Record<MissionFilter, number>>(() => ({
    open: rows.filter((row) => row.state === 'open').length,
    all: rows.length,
    done: rows.filter((row) => row.state === 'done').length,
    locked: rows.filter((row) => row.state === 'locked').length,
  }), [rows]);
  const recommended = useMemo(() => nextRecommendedMission(rows), [rows]);
  const shownRows = useMemo(
    () => sortMissionRows(filterMissionRows(rows, filter), sort),
    [filter, rows, sort],
  );
  const modules = useMemo(() => {
    const full = new Map(groupMissionRows(sortMissionRows(rows, 'curriculum')).map((module) => [module.id, module]));
    return groupMissionRows(shownRows).map((module) => ({
      ...module,
      completed: full.get(module.id)?.completed ?? module.completed,
      total: full.get(module.id)?.total ?? module.total,
    }));
  }, [rows, shownRows]);
  const activeModuleId = useMemo(
    () => groupMissionRows(sortMissionRows(rows, 'curriculum'))
      .find((module) => module.rows.some((row) => row.state === 'open'))?.id ?? null,
    [rows],
  );
  const canEditByCourse = useMemo(
    () => new Map(courses.map((course) => [course.id, course.canEdit && !course.isFixture] as const)),
    [courses],
  );

  const locate = (row: MissionBoardRow) => {
    prefs.set('lastCourseId', row.courseId);
    transition(() => router.navigate({
      pathname: '/tree/[courseId]',
      params: { courseId: row.courseId, focusNodeId: row.node.id, focusRequest: String(Date.now()) },
    }));
  };

  const completeMission = async (row: MissionBoardRow) => {
    const done = row.state !== 'done';
    try {
      await toggleMission(row.courseId, row.mission.id, done);
      const text = done
        ? `${row.mission.title} complete. ${row.mission.xpReward} XP registered.`
        : `${row.mission.title} unmarked for practice.`;
      setClaimingId(done ? row.mission.id : null);
      setActionNotice({ text, error: false });
      AccessibilityInfo.announceForAccessibility(text);
      if (claimTimer.current) clearTimeout(claimTimer.current);
      claimTimer.current = setTimeout(() => {
        setClaimingId(null);
        setActionNotice(null);
      }, prefs.motionOff ? 600 : 1200);
    } catch {
      const text = `Couldn't update ${row.mission.title}. Check device storage and try again.`;
      setActionNotice({ text, error: true });
      AccessibilityInfo.announceForAccessibility(text);
    }
  };

  const saveMission = async (update: MissionUpdate) => {
    if (!editing) return;
    setSaving(true);
    setSaveError(null);
    const key = ['tree', editing.courseId] as const;
    const previous = queryClient.getQueryData<TreeSnapshot>(key);
    queryClient.setQueryData<TreeSnapshot>(key, (current) => current ? applyMissionUpdate(current, update) : current);
    try {
      await persistMissionUpdate(update);
      await synchronizeEditedMission(editing.courseId, update).catch(() => {
        // The query cache already holds the saved server result. A broken device
        // draft must not turn a successful course-content update into an error.
      });
      setEditing(null);
    } catch (cause) {
      if (previous) queryClient.setQueryData(key, previous);
      setSaveError(cause instanceof Error ? cause.message : 'The mission could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const pending = coursesPending || treeQueries.some((query) => query.isPending) || !progressReady;
  const failed = treeQueries.find((query) => query.error)?.error;

  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <Head>
        <title>Missions · Cardinal Skill</title>
        <meta name="description" content="Choose, locate, and complete course missions by syllabus module." />
      </Head>
      <DitherField variant="quiet" bands={7} flat={prefs.lowBandwidth} />
      <StableScrollView
        showsVerticalScrollIndicator
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.cell }]}
      >
        <View style={styles.intro}>
          <PixelText variant="title">Missions</PixelText>
          <PixelText variant="body" colour={t.inkMuted}>
            Pick the next piece of work, then trace it back to the chart when you need context.
          </PixelText>
        </View>

        <MissionsHeader
          courseId={courseId}
          courses={courses}
          sort={sort}
          filter={filter}
          counts={counts}
          onCourseChange={(next) => {
            courseSelectionTouched.current = true;
            setCourseId(next);
            setExpanded({});
            if (next !== 'all') prefs.set('lastCourseId', next);
          }}
          onSortChange={setSort}
          onFilterChange={(next) => { setFilter(next); setExpanded({}); }}
        />

        {pending ? (
          <Window title="Reading missions" live={false}>
            <PixelText variant="body" colour={t.inkMuted}>COLLECTING COURSE WORK</PixelText>
          </Window>
        ) : failed ? (
          <Window title="Missions unavailable">
            <PixelText variant="body" colour={t.ink}>
              The mission list could not be loaded. Check your connection and try again.
            </PixelText>
          </Window>
        ) : (
          <>
            <PrimaryObjectiveCard row={recommended} showCourse={courseId === 'all'} onStart={() => recommended && locate(recommended)} />

            {modules.length === 0 ? (
              <Window title="Nothing here" live={false}>
                <PixelText variant="body" colour={t.ink}>
                  {filter === 'open'
                    ? 'No mission is ready right now. Clear a prerequisite on the chart to open more.'
                    : 'Nothing matches this filter.'}
                </PixelText>
              </Window>
            ) : modules.map((module) => {
              const defaultOpen = module.id === activeModuleId && module.completed < module.total;
              const open = expanded[module.id] ?? defaultOpen;
              return (
                <ModuleAccordion
                  key={module.id}
                  module={module}
                  open={open}
                  showCourse={courseId === 'all'}
                  onToggle={() => setExpanded((current) => ({ ...current, [module.id]: !open }))}
                >
                  {module.rows.map((row) => (
                    <MissionCard
                      key={`${row.courseId}:${row.mission.id}`}
                      row={row}
                      showCourse={courseId === 'all'}
                      canEdit={canEditByCourse.get(row.courseId) ?? false}
                      claiming={claimingId === row.mission.id}
                      reduceMotion={prefs.motionOff}
                      onLocate={() => locate(row)}
                      onToggle={() => completeMission(row)}
                      onEdit={() => { setSaveError(null); setEditing(row); }}
                    />
                  ))}
                </ModuleAccordion>
              );
            })}
          </>
        )}
      </StableScrollView>

      {actionNotice ? (
        <View
          pointerEvents="box-none"
          style={[styles.noticeDock, { bottom: insets.bottom + space.md }]}
        >
          <Animated.View
            entering={prefs.motionOff ? undefined : FadeInUp.duration(160)}
            exiting={prefs.motionOff ? undefined : FadeOutUp.duration(180)}
            style={styles.noticeWidth}
          >
            <Bevel
              tone={actionNotice.error ? 'panel' : 'earned'}
              style={[styles.actionNotice, actionNotice.error ? { borderColor: t.alarm } : null]}
              accessibilityLiveRegion="polite"
            >
              <PixelIcon name={actionNotice.error ? 'close' : 'check'} size={14} colour={actionNotice.error ? t.alarm : t.well} />
              <PixelText variant="body" colour={actionNotice.error ? t.alarm : t.well} style={styles.noticeText}>
                {actionNotice.text}
              </PixelText>
            </Bevel>
          </Animated.View>
        </View>
      ) : null}

      <EditMissionModal
        row={editing}
        saving={saving}
        saveError={saveError}
        onClose={() => { if (!saving) setEditing(null); }}
        onSave={saveMission}
      />
    </View>
  );
}

function ModuleAccordion({ module, open, showCourse, onToggle, children }: {
  module: MissionModule;
  open: boolean;
  showCourse: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const ratio = module.total === 0 ? 0 : module.completed / module.total;
  return (
    <View style={styles.module}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${module.title}. ${module.completed} of ${module.total} cleared. ${open ? 'Collapse' : 'Expand'}.`}
        style={({ pressed }) => [styles.moduleHeader, bevelStyle(t, 'panel', pressed ? 'inset' : 'raised')]}
      >
        <View style={styles.moduleTitle}>
          <PixelText variant="label" colour={t.ink}>{module.title}</PixelText>
          {showCourse ? <PixelText variant="micro" colour={t.info}>{module.courseTitle.toUpperCase()}</PixelText> : null}
        </View>
        <View style={styles.moduleProgress}>
          <PixelText variant="micro" colour={module.completed === module.total ? t.earnedText : t.inkMuted}>
            {module.completed}/{module.total} CLEARED · {Math.round(ratio * 100)}%
          </PixelText>
          <Meter value={ratio} cells={10} label={`${module.title}: ${Math.round(ratio * 100)} percent cleared`} />
        </View>
        <PixelIcon name={open ? 'minus' : 'plus'} size={14} colour={t.info} />
      </Pressable>
      {open ? <View style={styles.moduleBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: space.md, paddingRight: space.lg, paddingBottom: 120, gap: space.md },
  intro: { gap: space.xs },
  actionNotice: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.cell, padding: space.cell },
  noticeDock: { position: 'absolute', left: space.md, right: space.md, zIndex: 20, alignItems: 'center' },
  noticeWidth: { width: '100%', maxWidth: 688 },
  noticeText: { minWidth: 0, flex: 1 },
  module: { gap: space.cell },
  moduleHeader: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: space.cell, padding: space.cell },
  moduleTitle: { minWidth: 0, flex: 1, gap: space.hair },
  moduleProgress: { alignItems: 'flex-end', gap: space.xs },
  moduleBody: { gap: space.cell, paddingLeft: space.cell },
});
