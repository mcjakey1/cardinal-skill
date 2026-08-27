import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Easing,
  SlideInRight,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SkillTree } from '@/features/skilltree/SkillTree';
import { streakDays } from '@/features/skilltree/achievements';
import { rankNextQuests, shouldOfferHelp } from '@/features/skilltree/adaptive';
import { effectiveMissionCompletionIds, missionStates, nodeXpEarned, nodeXpFromMissions } from '@/features/skilltree/missions';
import { missionDifficulty } from '@/features/skilltree/missionBoard';
import { MAX_NAME, resolveQuestName, type NameSource } from '@/features/skilltree/naming';
import { learnerSignals, nodeSignal } from '@/features/skilltree/observed';
import {
  evaluateSkillUnlockState,
  levelForXp,
  progressRatio,
  totalXp,
} from '@/features/skilltree/progression';
import { HELP_SHARE } from '@/features/skilltree/subtree';
import { fetchTree } from '@/features/skilltree/queries';
import {
  duplicateCourse,
  fetchCourseOptions,
  updateCourseMetadata,
  type CourseMetadata,
  type CourseOption,
} from '@/features/skilltree/courseQueries';
import { PRIVATE_PRACTICE_DISTRIBUTION } from '@/features/skilltree/courseDistribution';
import { archiveSharedCourse, publishCommunityCourse, type CommunityVisibility } from '@/features/skilltree/courseCatalog';
import { aliveSubgraph } from '@/features/skilltree/chartDraft';
import { nodeProgress, rollUpProgress } from '@/features/skilltree/rollup';
import {
  finalizeMissionDrafts,
  missionDraftTotal,
  toMissionDrafts,
  type MissionDraft,
} from '@/features/skilltree/missionEditing';
import { displayStatus } from '@/features/skilltree/nodeVisualState';
import { PIXEL_ICON_KEYS, resolvePixelIcon, type PixelIconKey } from '@/features/skilltree/pixelIcons';
import type { Mission, SkillNode, Tree } from '@/features/skilltree/types';
import { validateGraph } from '@/features/skilltree/validation';
import { DOCK_WIDTH, useWide } from '@/lib/layout';
import { useNodeLayout, type NodePosition } from '@/lib/nodeLayout';
import { purgeCourseCache, useEditedTree } from '@/lib/editedTree';
import { removeCachedCourse } from '@/lib/courseCache';
import { usePrefs } from '@/lib/prefs';
import { clearLocal, useLocalProgress } from '@/lib/progress';
import { useQuestNames } from '@/lib/questNames';
import { useSignals } from '@/lib/signals';
import { supabase } from '@/lib/supabase';
import { findMockCourse } from '@/features/skilltree/mockCourses';
import { PracticeCopyPrompt } from '@/ui/PracticeCopyPrompt';
import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Backdrop } from '@/ui/Backdrop';
import { Window } from '@/ui/Window';
import { StudyCompanionDrawer } from '@/ui/StudyCompanionDrawer';
import { StableScrollView } from '@/ui/StableScrollView';
import { SubjectPixelIcon } from '@/ui/SubjectPixelIcon';
import { usePixelTransition } from '@/ui/PixelTransition';
import { CourseSelector } from '@/ui/CourseSelector';
import {
  Bevel,
  Meter,
  PixelButton,
  PixelIcon,
  PixelInput,
  PixelText,
  StatusTag,
  Toggle,
  bevelStyle,
} from '@/ui/pixel';

/** Where the name on screen came from. A word, never a colour. */
const NAME_SOURCE: Record<NameSource, string> = {
  override: 'RENAMED BY HAND',
  generated: 'GENERATED NAME',
  syllabus: 'SYLLABUS TITLE',
};

const unavailableCourseManagement = async () => {
  throw new Error('Course management is unavailable until this chart reconnects.');
};

export default function TreeScreen() {
  const t = useTheme();
  const { theme } = useAppTheme();
  const { courseId, edit, focusNodeId, focusRequest } = useLocalSearchParams<{
    courseId: string;
    edit?: string;
    focusNodeId?: string;
    focusRequest?: string;
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { transition } = usePixelTransition();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const wide = useWide();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [confirmingHelp, setConfirmingHelp] = useState(false);
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpNote, setHelpNote] = useState<string | null>(null);
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [claimedMissionId, setClaimedMissionId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(edit === '1');
  const [practiceCopyOpen, setPracticeCopyOpen] = useState(false);
  const [practiceCopyBusy, setPracticeCopyBusy] = useState(false);
  const [practiceCopyError, setPracticeCopyError] = useState<string | null>(null);
  const [cameraFocusRequest, setCameraFocusRequest] = useState(0);
  const [locatedNodeId, setLocatedNodeId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [editingProperties, setEditingProperties] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editXp, setEditXp] = useState('50');
  const [editIcon, setEditIcon] = useState<PixelIconKey>('pixel_spellbook');
  const [editUniversal, setEditUniversal] = useState(false);
  const [editMissions, setEditMissions] = useState<MissionDraft[]>([]);
  const [editUsesMissionRewards, setEditUsesMissionRewards] = useState(false);
  const claimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledLocateRequest = useRef<string | null>(null);
  const linkNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (claimTimer.current) clearTimeout(claimTimer.current);
      if (locateTimer.current) clearTimeout(locateTimer.current);
      if (linkNoticeTimer.current) clearTimeout(linkNoticeTimer.current);
    },
    [],
  );

  useEffect(() => {
    setEditMode(edit === '1');
    setSelectedId(null);
    setLinkMode(false);
    setLinkSourceId(null);
  }, [courseId, edit]);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['tree', courseId],
    queryFn: () => fetchTree(courseId),
    enabled: Boolean(courseId),
  });
  const { data: courseOptions = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: fetchCourseOptions,
  });
  const currentCourse = courseOptions.find((course) => course.id === courseId) ?? null;

  useEffect(() => {
    if (!currentCourse || currentCourse.isFixture || currentCourse.canEdit || edit !== '1') return;
    setEditMode(false);
    setPracticeCopyError(null);
    setPracticeCopyOpen(true);
    router.replace({ pathname: '/tree/[courseId]', params: { courseId } });
  }, [courseId, currentCourse, edit, router]);

  const {
    log,
    missionLog,
    missionUnmarks,
    ready: progressReady,
    complete,
    toggleMission,
    reset: resetLocalProgress,
  } = useLocalProgress(courseId);

  useFocusEffect(useCallback(() => {
    setCameraFocusRequest((request) => request + 1);
  }, []));
  const {
    edited,
    ready: editedTreeReady,
    save: saveEditedTree,
    clear: clearEditedTree,
  } = useEditedTree(
    courseId,
    data?.tree.nodes.map((n) => n.id),
  );
  const { overrides, rename } = useQuestNames(courseId);
  const { visits, noteVisit, noteHelpRequested } = useSignals(courseId);
  const { positions, moveNode, resetLayout } = useNodeLayout(courseId);

  /**
   * How long the open node has been open.
   *
   * This is the one observation the adaptive engine can honestly take from this
   * build — see `observed.ts`. Recorded when the selection changes and again on
   * unmount, because leaving via the nav bar is the common way out and dropping
   * that visit would under-count exactly the student who is struggling.
   */
  const openSince = useRef<{ id: string; at: number } | null>(null);

  useEffect(() => {
    const prev = openSince.current;
    if (prev && prev.id !== selectedId) void noteVisit(prev.id, Date.now() - prev.at);
    openSince.current = selectedId ? { id: selectedId, at: Date.now() } : null;
  }, [selectedId, noteVisit]);

  useEffect(
    () => () => {
      const prev = openSince.current;
      if (prev) void noteVisit(prev.id, Date.now() - prev.at);
      openSince.current = null;
    },
    [noteVisit],
  );

  // The nav bar's CHART cell needs somewhere to go once you have been here.
  useEffect(() => {
    if (courseId) prefs.set('lastCourseId', courseId);
    // Only when the course changes: `prefs.set` is stable, and re-running on
    // every prefs change would write on its own write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Retired nodes are hidden from students by RLS, so for a student this filter
  // is a no-op. It is here for the one person RLS deliberately still shows them
  // to: the course owner, arriving from "Open as a student" to check the chart
  // as delivered. Without it they are shown the one chart that is not the
  // chart — retired nodes drawn as live, and counted in the XP denominator.
  const sourceTree = useMemo(() => {
    const raw = edited?.tree ?? data?.tree;
    return raw ? aliveSubgraph(raw) : raw;
  }, [data?.tree, edited?.tree]);
  const sourceMissions = useMemo(
    () => edited?.missions ?? data?.missions ?? [],
    [data?.missions, edited?.missions],
  );

  useEffect(() => {
    const targetNodeId = focusNodeId;
    const request = targetNodeId ? `${targetNodeId}:${focusRequest ?? ''}` : null;
    if (
      !request
      || handledLocateRequest.current === request
      || !targetNodeId
      || !sourceTree?.nodes.some((node) => node.id === targetNodeId)
    ) return;
    handledLocateRequest.current = request;
    setSelectedId(targetNodeId);
    setLocatedNodeId(targetNodeId);
    if (locateTimer.current) clearTimeout(locateTimer.current);
    locateTimer.current = setTimeout(() => setLocatedNodeId(null), prefs.motionOff ? 0 : 1500);
  }, [focusNodeId, focusRequest, prefs.motionOff, sourceTree]);

  // A blank course is the manual-authoring entry point. The URL flag gets the
  // first visit there immediately; this fallback also restores the editor
  // after a reload, when transient query parameters are no longer present.
  useEffect(() => {
    if (!editedTreeReady || !data || !sourceTree || sourceTree.nodes.length > 0) return;
    if (currentCourse && !currentCourse.isFixture && !currentCourse.canEdit) return;
    setEditMode(true);
  }, [currentCourse, data, editedTreeReady, sourceTree]);

  const merged = useMemo(() => {
    if (!data || !sourceTree) return null;
    return rollUpProgress({
      tree: sourceTree,
      missions: sourceMissions,
      // The server's record and this device's record are both true; a student
      // on a metered connection completes work offline and syncs later.
      completedMissionIds: effectiveMissionCompletionIds(
        data.completedMissionIds,
        Object.keys(missionLog),
        Object.keys(missionUnmarks),
      ),
      serverCompletedMissionIds: data.completedMissionIds,
      directlyCompletedIds: Object.keys(log),
      serverMasteredIds: data.masteredIds,
      serverXp: data.xp,
    });
  }, [data, log, missionLog, missionUnmarks, sourceMissions, sourceTree]);

  // One name per node, resolved once. The chart, the detail window, the REQUIRES
  // list and the "what next" bar all read from here, because two surfaces
  // calling the same node different things reads as two different nodes.
  const named = useMemo<SkillNode[]>(
    () =>
      sourceTree?.nodes.map((n) => ({ ...n, title: resolveQuestName(n, overrides[n.id]).text })) ??
      [],
    [overrides, sourceTree],
  );

  const selected = useMemo<SkillNode | null>(
    () => named.find((n) => n.id === selectedId) ?? null,
    [named, selectedId],
  );

  // The node as it arrived, for the rename form: `selected.title` is already the
  // resolved name, so editing against it would treat a generated name as
  // something a person had typed.
  const original = useMemo<SkillNode | null>(
    () => sourceTree?.nodes.find((n) => n.id === selectedId) ?? null,
    [selectedId, sourceTree],
  );
  const tree = useMemo<Tree>(
    () => ({ nodes: named, prereqs: sourceTree?.prereqs ?? [] }),
    [named, sourceTree?.prereqs],
  );

  if (isPending || !editedTreeReady || !progressReady) return <Loading />;
  if (error || !data || !merged) {
    const failedTitle = courseOptions.find((course) => course.id === courseId)?.title
      ?? 'Chart unavailable';
    return (
      <Failed
        currentCourseId={courseId}
        currentTitle={failedTitle}
        detail={readableError(error)}
        courses={courseOptions}
        reduceMotion={prefs.motionOff}
        onRetry={() => refetch()}
        onUpload={() => transition(() => router.navigate('/upload'))}
        onSelect={(nextCourseId) => {
          if (nextCourseId !== courseId) {
            transition(() => router.replace({
              pathname: '/tree/[courseId]',
              params: { courseId: nextCourseId },
            }));
          }
        }}
      />
    );
  }

  const { title } = data;
  const missions = sourceMissions;
  const { masteredIds, xp, completedMissionIds } = merged;
  const selectableCourses = courseOptions.some((course) => course.id === courseId)
    ? courseOptions
    : [{
        id: courseId,
        courseCode: null,
        title,
        term: null,
        ...PRIVATE_PRACTICE_DISTRIBUTION,
        canEdit: false,
        canDelete: false,
        canRemove: false,
        isFixture: false,
        sortOrder: 0,
      }, ...courseOptions];

  if (tree.nodes.length === 0 && !editMode) {
    return (
      <EmptyChart
        title={title}
        onEdit={() => setEditMode(true)}
        onCourses={() => router.replace('/courses')}
        onUpload={() => router.navigate('/upload')}
      />
    );
  }

  const level = levelForXp(xp);
  const courseXpMax = totalXp(tree.nodes);
  const courseXpProgress = progressRatio(xp, courseXpMax);
  // A day counts if any work landed on it, whether a whole node or one mission.
  const streak = streakDays([...Object.values(log), ...Object.values(missionLog)]);
  const eligibility = selected
    ? evaluateSkillUnlockState(selected.id, tree, masteredIds)
    : null;
  const isMastered = selected ? masteredIds.includes(selected.id) : false;
  const status = isMastered ? 'mastered' : eligibility?.isUnlocked ? 'available' : 'locked';
  // When a node was cleared, for pace. A node finished through its missions has
  // no completion stamp of its own, so the last mission to land is the time it
  // was actually finished.
  const masteredAtById: Record<string, string> = {};
  for (const id of masteredIds) {
    const direct = log[id];
    if (direct) {
      masteredAtById[id] = direct;
      continue;
    }
    const times = missions
      .filter((m) => m.skillId === id)
      .map((m) => missionLog[m.id])
      .filter((at): at is string => Boolean(at))
      .sort();
    const last = times[times.length - 1];
    if (last) masteredAtById[id] = last;
  }

  const signals = learnerSignals(visits, masteredAtById, streak);
  // Ranked for this learner rather than in syllabus order: the smallest next win
  // when they are struggling, the biggest unlock when they are flying.
  const next = rankNextQuests(tree, masteredIds, signals, 1)[0];

  const nameSource = original ? resolveQuestName(original, overrides[original.id]).source : 'syllabus';
  const hasOverride = Boolean(original && overrides[original.id]);

  // Only for a node they can actually work on and have not finished. Offering a
  // scaffold on locked or finished work is the fastest way to make the feature
  // feel broken.
  const helpOffer =
    selected && status === 'available'
      ? shouldOfferHelp(nodeSignal(selected.id, visits[selected.id]), selected)
      : null;

  const requestHelp = async () => {
    if (!selected || !courseId) return;
    setHelpBusy(true);
    setHelpNote(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setHelpNote('Extra practice needs a signed-in account, and sign-in is not wired yet.');
        return;
      }
      const { error: helpError } = await supabase.functions.invoke('suggest-subtree', {
        body: { courseId, nodeId: selected.id, requester: 'student' },
      });
      if (helpError) throw helpError;

      await noteHelpRequested(selected.id);
      await refetch();
      setConfirmingHelp(false);
      AccessibilityInfo.announceForAccessibility(
        `Extra practice steps added under ${selected.title}.`,
      );
    } catch (err) {
      setHelpNote(err instanceof Error ? err.message : String(err));
    } finally {
      setHelpBusy(false);
    }
  };

  const startRenaming = (node: SkillNode) => {
    setDraftName(overrides[node.id] ?? node.titleOverride ?? '');
    setRenaming(true);
  };

  const selectedMissions = selected
    ? missionStates(missions, selected.id, completedMissionIds, status !== 'locked')
    : [];
  const missionsDone = selectedMissions.filter((m) => m.state === 'done').length;

  // XP rather than a count, because that is what the work is actually worth and
  // two missions on one node are rarely worth the same.
  const nodeXpTotal = selected ? nodeXpFromMissions(missions, selected.id) : 0;
  const nodeXpDone = selected ? nodeXpEarned(missions, selected.id, completedMissionIds) : 0;
  const detailStatus = displayStatus(
    status,
    selected ? nodeProgress(selected, missions, completedMissionIds, isMastered) : 0,
  );
  const previewNodeTheme = detailStatus === 'mastered'
    ? theme.nodeCompleted
    : detailStatus === 'locked'
      ? theme.nodeLocked
      : theme.nodeActive;
  const editMissionTotal = missionDraftTotal(editMissions);
  const editNodeTotal = editUsesMissionRewards
    ? editMissionTotal
    : Math.max(0, Number.parseInt(editXp, 10) || 0);

  // Every prerequisite, not just the unmet ones. Seeing "2 of 3 mastered" while
  // still locked tells a student how close they are; a list that only appears
  // when it is bad news tells them nothing on the way there.
  const prereqNodes = selected
    ? tree.prereqs
        .filter((p) => p.nodeId === selected.id)
        .map((p) => tree.nodes.find((n) => n.id === p.prereqId))
        .filter((n): n is SkillNode => Boolean(n))
    : [];
  const prereqsMastered = prereqNodes.filter((p) => masteredIds.includes(p.id)).length;
  const progressByNode = Object.fromEntries(
    tree.nodes.map((node) => [
      node.id,
      nodeProgress(node, missions, completedMissionIds, masteredIds.includes(node.id)),
    ]),
  );

  const claimMission = async (missionId: string, title: string, xpReward: number, done: boolean) => {
    await toggleMission(missionId, !done);
    if (done) return;
    AccessibilityInfo.announceForAccessibility(`${title} complete. ${xpReward} XP claimed.`);
    if (prefs.motionOff) return;
    setClaimedMissionId(missionId);
    if (claimTimer.current) clearTimeout(claimTimer.current);
    claimTimer.current = setTimeout(
      () => setClaimedMissionId((active) => (active === missionId ? null : active)),
      700,
    );
  };

  const onComplete = async (node: SkillNode) => {
    await complete(node.id);
    setJustCompleted(node.id);
    setSelectedId(null);
    AccessibilityInfo.announceForAccessibility(
      `${node.title} marked complete. ${node.xpReward} XP recorded.`,
    );
  };

  const persistEdit = async (nextTree: Tree, nextMissions: Mission[] = missions) => {
    await saveEditedTree({ tree: nextTree, missions: nextMissions });
  };

  const selectNode = async (node: SkillNode) => {
    if (editMode && linkMode) {
      if (!linkSourceId) return;
      if (linkSourceId === node.id) {
        showLinkNotice('Cannot link a node to itself');
        return;
      }
      const edge = { prereqId: linkSourceId, nodeId: node.id };
      const prereqs = [...tree.prereqs.filter((item) => !(item.prereqId === edge.prereqId && item.nodeId === edge.nodeId)), edge];
      const check = validateGraph(sourceTree?.nodes ?? [], prereqs);
      if (!check.isValid) {
        showLinkNotice(check.errors[0]?.message ?? 'That link would make the chart invalid.');
        return;
      }
      await persistEdit({ nodes: sourceTree?.nodes ?? [], prereqs });
      AccessibilityInfo.announceForAccessibility(`Connected ${sourceTree?.nodes.find((item) => item.id === linkSourceId)?.title ?? 'source'} to ${node.title}.`);
      setLinkNotice('Nodes connected');
      cancelLink();
      setSelectedId(node.id);
      return;
    }
    setSelectedId(node.id);
    setRenaming(false);
    setConfirmingHelp(false);
    setHelpNote(null);
  };

  const showLinkNotice = (message: string) => {
    setLinkNotice(message);
    AccessibilityInfo.announceForAccessibility(message);
    if (linkNoticeTimer.current) clearTimeout(linkNoticeTimer.current);
    linkNoticeTimer.current = setTimeout(() => setLinkNotice(null), 1800);
  };

  const cancelLink = () => {
    setLinkMode(false);
    setLinkSourceId(null);
  };

  const startLink = () => {
    if (linkMode) {
      cancelLink();
      return;
    }
    if (!selectedId) {
      showLinkNotice('Select a source node first');
      return;
    }
    setLinkSourceId(selectedId);
    setLinkMode(true);
    setLinkNotice(null);
  };

  const addNode = async (at: NodePosition) => {
    if (!sourceTree) return;
    const id = `local-${Date.now()}`;
    const node: SkillNode = {
      id, courseId, trackId: null, title: 'New skill', description: 'Describe this skill.',
      kind: 'topic', iconKey: 'pixel_spellbook', xpReward: 50,
      x: at.x, y: at.y, sortOrder: sourceTree.nodes.length,
    };
    await persistEdit({ ...sourceTree, nodes: [...sourceTree.nodes, node] });
    setSelectedId(id);
    setEditingProperties(true);
    setEditTitle(node.title);
    setEditDescription(node.description);
    setEditXp(String(node.xpReward));
    setEditIcon(resolvePixelIcon(node));
    setEditUniversal(false);
    setEditMissions([]);
    setEditUsesMissionRewards(false);
  };

  const deleteSelectedNode = async () => {
    if (!sourceTree || !selectedId) return;
    await persistEdit(
      {
        nodes: sourceTree.nodes.filter((node) => node.id !== selectedId),
        prereqs: sourceTree.prereqs.filter((edge) => edge.nodeId !== selectedId && edge.prereqId !== selectedId),
      },
      missions.filter((mission) => mission.skillId !== selectedId),
    );
    setSelectedId(null);
  };

  const beginPropertyEdit = () => {
    if (!original) return;
    setEditTitle(original.title);
    setEditDescription(original.description);
    setEditXp(String(original.xpReward));
    setEditIcon(resolvePixelIcon(original));
    setEditUniversal(Boolean(original.trackId));
    const ownMissions = missions.filter((mission) => mission.skillId === original.id);
    setEditMissions(toMissionDrafts(ownMissions));
    setEditUsesMissionRewards(ownMissions.length > 0);
    setEditingProperties(true);
  };

  const saveProperties = async () => {
    if (!sourceTree || !original) return;
    const nextOwnMissions = finalizeMissionDrafts(editMissions);
    const missionTotal = nextOwnMissions.reduce((total, mission) => total + mission.xpReward, 0);
    const xpReward = editUsesMissionRewards
      ? missionTotal
      : Math.max(0, Math.min(10000, Number.parseInt(editXp, 10) || 0));
    const nextNodes = sourceTree.nodes.map((node) => node.id === original.id
      ? {
          ...node,
          title: editTitle.trim() || 'Untitled skill',
          titleOverride: editTitle.trim() || 'Untitled skill',
          description: editDescription.trim(),
          xpReward,
          iconKey: editIcon,
          trackId: editUniversal ? (node.trackId ?? `local-universal-${node.id}`) : null,
          courseId: editUniversal ? null : courseId,
        }
      : node);
    const nextMissions = [
      ...missions.filter((mission) => mission.skillId !== original.id),
      ...nextOwnMissions,
    ];
    await persistEdit({ ...sourceTree, nodes: nextNodes }, nextMissions);
    setEditingProperties(false);
  };

  const addMission = () => {
    if (!original) return;
    const mission: MissionDraft = {
      id: `local-mission-${Date.now()}-${editMissions.length}`,
      skillId: original.id,
      title: 'New mission',
      description: '',
      kind: original.kind,
      xpReward: '0',
      estimatedMinutes: 30,
    };
    setEditUsesMissionRewards(true);
    setEditMissions((current) => [...current, mission]);
  };

  const removeMission = (missionId: string) => {
    setEditMissions((current) => current.filter((mission) => mission.id !== missionId));
  };

  const resetProgress = async (targetCourseId: string) => {
    try {
      if (!findMockCourse(targetCourseId) && targetCourseId !== 'demo') {
        const { error: resetError } = await supabase.rpc('reset_own_course_progress', { p_course_id: targetCourseId });
        if (resetError) throw resetError;
      }
      if (targetCourseId === courseId) {
        await resetLocalProgress();
        await refetch();
      } else {
        await clearLocal(targetCourseId);
      }
      AccessibilityInfo.announceForAccessibility('Course progress reset to zero.');
    } catch {
      AccessibilityInfo.announceForAccessibility('Progress could not be reset. Check your connection and try again.');
      throw new Error('Progress could not be reset. Check your connection and try again.');
    }
  };

  const saveCourseMetadata = async (targetCourseId: string, metadata: CourseMetadata) => {
    try {
      await updateCourseMetadata(targetCourseId, metadata);
      await queryClient.invalidateQueries({ queryKey: ['courses'] });
      await queryClient.invalidateQueries({ queryKey: ['tree', targetCourseId] });
      AccessibilityInfo.announceForAccessibility('Course details saved.');
    } catch {
      AccessibilityInfo.announceForAccessibility('Course details could not be saved. Check your connection and try again.');
      throw new Error('Course details could not be saved. Check your connection and try again.');
    }
  };

  const deleteTree = async (targetCourseId: string) => {
    if (findMockCourse(targetCourseId) || targetCourseId === 'demo') return;
    try {
      const { error: deleteError } = await supabase.from('courses').delete().eq('id', targetCourseId);
      if (deleteError) throw deleteError;
      await purgeCourseCache(targetCourseId);
      await removeCachedCourse(targetCourseId);
      if (targetCourseId === courseId) await clearEditedTree();
      await queryClient.invalidateQueries({ queryKey: ['courses'] });
      if (targetCourseId === courseId) transition(() => router.replace('/courses'));
    } catch {
      AccessibilityInfo.announceForAccessibility('This tree could not be deleted. Only its owner can delete it.');
      throw new Error('This tree could not be deleted. Only its owner can delete it.');
    }
  };

  const duplicateTree = async (targetCourseId: string) => {
    try {
      const copiedCourseId = await duplicateCourse(targetCourseId);
      await queryClient.invalidateQueries({ queryKey: ['courses'] });
      AccessibilityInfo.announceForAccessibility('Editable course copy created.');
      transition(() => router.replace({
        pathname: '/tree/[courseId]',
        params: { courseId: copiedCourseId, edit: '1' },
      }));
    } catch {
      AccessibilityInfo.announceForAccessibility('The course copy could not be created.');
      throw new Error('The course copy could not be created. Check your connection and try again.');
    }
  };

  const shareCourse = async (targetCourseId: string, visibility: CommunityVisibility) => {
    try {
      const shareCode = await publishCommunityCourse(targetCourseId, visibility);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['course-catalog'] }),
      ]);
      AccessibilityInfo.announceForAccessibility('Community sharing updated.');
      return shareCode;
    } catch {
      throw new Error('Sharing could not be updated. Check your connection and try again.');
    }
  };

  const archiveCourse = async (targetCourseId: string) => {
    try {
      await archiveSharedCourse(targetCourseId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['course-catalog'] }),
      ]);
      AccessibilityInfo.announceForAccessibility('Shared course archived. Existing learner progress was preserved.');
    } catch {
      throw new Error('The shared course could not be archived. Check your connection and try again.');
    }
  };

  const createPracticeCopy = async () => {
    setPracticeCopyBusy(true);
    setPracticeCopyError(null);
    try {
      await duplicateTree(courseId);
      setPracticeCopyOpen(false);
    } catch (cause) {
      setPracticeCopyError(cause instanceof Error
        ? cause.message
        : 'The practice copy could not be created. Check your connection and try again.');
    } finally {
      setPracticeCopyBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <Backdrop flat={prefs.lowBandwidth} />

      <View
        style={[
          styles.marginalia,
          {
            paddingTop: insets.top + space.cell,
            backgroundColor: theme.hudBackground,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <View style={styles.courseBlock}>
          <View style={styles.courseActions}>
          <CourseSelector
            open={courseMenuOpen}
            currentCourseId={courseId}
            currentTitle={title}
            courses={selectableCourses}
            currentProgress={{ cleared: masteredIds.length, total: tree.nodes.length }}
            reduceMotion={prefs.motionOff}
            onToggle={() => setCourseMenuOpen((open) => !open)}
            onUpdate={saveCourseMetadata}
            onReset={resetProgress}
            onShare={shareCourse}
            onArchive={archiveCourse}
            onDuplicate={duplicateTree}
            onDelete={deleteTree}
            onSelect={(nextCourseId) => {
              setCourseMenuOpen(false);
              if (nextCourseId !== courseId) {
                transition(() => router.replace({ pathname: '/tree/[courseId]', params: { courseId: nextCourseId } }));
              }
            }}
          />
          <Pressable
            onPress={() => transition(() => router.navigate('/upload'))}
            accessibilityRole="button"
            accessibilityLabel="Upload a syllabus"
            style={({ pressed }) => [
              styles.uploadButton,
              bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
            ]}
          >
            <PixelIcon name="plus" size={12} colour={t.info} />
            <PixelText variant="micro" colour={t.ink}>UPLOAD</PixelText>
          </Pressable>
          </View>
        </View>

        <View style={styles.readout}>
          <PixelText variant="micro" colour={t.ink}>
            LV {level} · {xp}/{courseXpMax} XP
          </PixelText>
          <Meter
            value={courseXpProgress}
            cells={10}
            colour={theme.xpBarFill}
            label={`${Math.round(courseXpProgress * 100)} percent of course XP earned`}
          />
          {streak > 0 ? (
            <View style={styles.streak}>
              <PixelIcon name="stamp" size={12} colour={t.earnedText} />
              <PixelText variant="micro" colour={t.earnedText}>
                {streak} DAY{streak === 1 ? '' : 'S'} RUNNING
              </PixelText>
            </View>
          ) : null}
        </View>
      </View>

      <Head>
        <title>{`${title} · Cardinal Skill`}</title>
        <meta
          name="description"
          content={`${masteredIds.length} of ${tree.nodes.length} cleared on ${title}.`}
        />
      </Head>

      {/* One row on a wide screen, one column on a phone. The chart keeps
          whatever the detail window does not take, rather than the window
          covering the thing it is describing. */}
      <View style={wide ? styles.wideBody : styles.fill}>
        <View style={styles.fill}>
      <SkillTree
        key={courseId}
        viewportKey={courseId}
        tree={tree}
        masteredIds={masteredIds}
        selectedId={selectedId}
        onSelectNode={selectNode}
        editMode={editMode}
        linkMode={linkMode}
        linkSourceId={linkSourceId}
        linkNotice={linkNotice}
        onToggleEditMode={(next) => {
          if (next && currentCourse && !currentCourse.isFixture && !currentCourse.canEdit) {
            setPracticeCopyError(null);
            setPracticeCopyOpen(true);
            return;
          }
          setEditMode(next);
          if (!next) {
            setLinkMode(false);
            setLinkSourceId(null);
          }
        }}
        onAddNode={addNode}
        onToggleLinkMode={startLink}
        onCancelLink={cancelLink}
        onDeleteNode={deleteSelectedNode}
        recommendedId={next?.id ?? null}
        recentlyMasteredId={justCompleted}
        reduceMotion={prefs.motionOff}
        lowBandwidth={prefs.lowBandwidth}
        positions={positions}
        onMoveNode={moveNode}
        onResetLayout={resetLayout}
        progressByNode={progressByNode}
        focusRequestKey={cameraFocusRequest}
        focusNodeId={locatedNodeId}
        focusNodeRequestKey={focusRequest ?? 0}
      />
        </View>

      {selected && eligibility ? (
        <>
        <Animated.View
          key={selected.id}
          entering={prefs.motionOff ? undefined : SlideInRight.duration(240).easing(Easing.out(Easing.cubic))}
          exiting={prefs.motionOff ? undefined : SlideOutRight.duration(200).easing(Easing.in(Easing.cubic))}
          style={wide ? styles.dockWide : styles.dock}
        >
        <Window
          title={selected.title}
          onClose={() => setSelectedId(null)}
          style={styles.detailWindow}
        >
          <View style={styles.rowBetween}>
            <View style={styles.headerTags}>
              <PixelText variant="micro" colour={t.info}>
                {selected.trackId ? 'UNIVERSAL SKILL' : 'COURSE SKILL'}
              </PixelText>
              <StatusTag status={detailStatus} />
            </View>
            <PixelText variant="label" colour={t.earnedText}>
              {selected.xpReward} XP TOTAL
            </PixelText>
          </View>

          {/* Capped on a phone so the window cannot swallow the chart; on a wide
              screen it has its own column and can use the height it has. */}
          <StableScrollView style={wide ? styles.sheetScrollWide : styles.sheetScroll}>
            {editMode ? (
              <View style={styles.editProperties}>
                {editingProperties ? (
                  <Animated.View
                    entering={prefs.motionOff ? undefined : SlideInRight.duration(240).easing(Easing.out(Easing.cubic))}
                    exiting={prefs.motionOff ? undefined : SlideOutRight.duration(200).easing(Easing.in(Easing.cubic))}
                    style={styles.editForm}
                  >
                    <PixelInput label="Node title" value={editTitle} onChangeText={setEditTitle} />
                    <PixelInput label="Topic / description" value={editDescription} onChangeText={setEditDescription} multiline />
                    {editUsesMissionRewards ? (
                      <Field label="NODE TOTAL XP" value={`${editNodeTotal} XP`} detail="SUM OF MISSION REWARDS" />
                    ) : (
                      <PixelInput label="Node total XP" value={editXp} onChangeText={setEditXp} keyboardType="number-pad" />
                    )}
                    <Toggle value={editUniversal} onChange={setEditUniversal} label="Universal skill" />
                    <PixelText variant="micro" colour={t.info}>PIXEL ICON</PixelText>
                    <ScrollView horizontal contentContainerStyle={styles.iconChoices} showsHorizontalScrollIndicator={false}>
                      {PIXEL_ICON_KEYS.map((icon) => (
                        <Pressable
                          key={icon}
                          onPress={() => setEditIcon(icon)}
                          accessibilityRole="radio"
                          accessibilityLabel={icon.replaceAll('_', ' ')}
                          accessibilityState={{ checked: editIcon === icon }}
                          style={({ pressed }) => [
                            styles.iconChoice,
                            bevelStyle(t, editIcon === icon ? 'brand' : 'panel', pressed || editIcon === icon ? 'inset' : 'raised'),
                          ]}
                        >
                          <SubjectPixelIcon icon={icon} size={20} colour={editIcon === icon ? t.brandInk : t.inkMuted} />
                        </Pressable>
                      ))}
                    </ScrollView>
                    <View style={[styles.livePreview, { backgroundColor: theme.surface, borderColor: previewNodeTheme.border }]}>
                      <PixelText variant="micro" colour={theme.nodeCompleted.border}>LIVE PREVIEW</PixelText>
                      <View style={styles.previewNodeRow}>
                        <View style={[styles.previewNode, { backgroundColor: previewNodeTheme.background, borderColor: previewNodeTheme.border }]}>
                          <SubjectPixelIcon icon={editIcon} colour={previewNodeTheme.icon} />
                        </View>
                        <View style={styles.grow}>
                          <PixelText variant="label" colour={theme.textPrimary} numberOfLines={2}>{editTitle.trim() || 'Untitled skill'}</PixelText>
                          <PixelText variant="micro" colour={theme.textMuted} numberOfLines={2}>{editDescription.trim() || 'No topic description yet.'}</PixelText>
                        </View>
                      </View>
                      <View style={styles.previewMeta}>
                        <StatusTag status={detailStatus} />
                        <PixelText variant="micro" colour={theme.textSecondary}>{editUniversal ? 'UNIVERSAL SKILL' : 'COURSE SKILL'}</PixelText>
                        <PixelText variant="micro" colour={theme.nodeCompleted.icon}>{editNodeTotal} XP</PixelText>
                      </View>
                    </View>
                    <View style={styles.localMissionTools}>
                      <View style={styles.rowBetween}>
                        <PixelText variant="micro" colour={t.info}>MISSIONS &amp; REWARDS</PixelText>
                        <PixelText variant="micro" colour={t.earnedText}>{editMissionTotal} XP</PixelText>
                      </View>
                      {editMissions.map((mission) => (
                        <View key={mission.id} style={[styles.missionEditRow, { borderColor: theme.border }]}>
                          <View style={styles.missionTitleEdit}>
                            <PixelInput
                              label="Mission title"
                              value={mission.title}
                              onChangeText={(title) => setEditMissions((current) => current.map((item) => (
                                item.id === mission.id ? { ...item, title } : item
                              )))}
                            />
                          </View>
                          <View style={styles.missionXpEdit}>
                            <PixelInput
                              label="XP"
                              value={mission.xpReward}
                              keyboardType="number-pad"
                              onChangeText={(xpReward) => setEditMissions((current) => current.map((item) => (
                                item.id === mission.id ? { ...item, xpReward } : item
                              )))}
                            />
                          </View>
                          <Pressable
                            onPress={() => removeMission(mission.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${mission.title}`}
                            style={({ pressed }) => [
                              styles.missionDelete,
                              bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
                            ]}
                          >
                            <PixelIcon name="close" size={12} colour={t.alarm} />
                          </Pressable>
                        </View>
                      ))}
                      <PixelButton tone="panel" label="+ Add mission" onPress={addMission} />
                    </View>
                    <PixelButton label="Save properties" onPress={saveProperties} />
                    <PixelButton tone="panel" label="Cancel editing" onPress={() => setEditingProperties(false)} />
                  </Animated.View>
                ) : (
                  <PixelButton tone="panel" label="Rename / edit properties" onPress={beginPropertyEdit} />
                )}
              </View>
            ) : null}
            {original ? (
              <View style={styles.naming}>
                <View style={styles.rowBetween}>
                  <PixelText variant="micro" colour={t.inkMuted}>
                    {NAME_SOURCE[nameSource]}
                  </PixelText>
                  <Pressable
                    onPress={() => (renaming ? setRenaming(false) : startRenaming(original))}
                    accessibilityRole="button"
                    accessibilityLabel={
                      renaming ? 'Stop renaming this node' : `Rename ${selected.title}`
                    }
                    style={styles.renameToggle}
                  >
                    <PixelText variant="micro" colour={t.alarm}>
                      {renaming ? 'CANCEL' : 'RENAME'}
                    </PixelText>
                  </Pressable>
                </View>

                {original.questSubtitle && nameSource !== 'syllabus' ? (
                  <PixelText variant="body" colour={t.inkMuted}>
                    {original.questSubtitle}
                  </PixelText>
                ) : null}

                {renaming ? (
                  <View style={styles.renameForm}>
                    <PixelInput
                      label="Quest name"
                      value={draftName}
                      onChangeText={setDraftName}
                      maxLength={MAX_NAME}
                      placeholder={original.questTitle ?? original.title}
                    />
                    <PixelText variant="micro" colour={t.inkMuted}>
                      {draftName.trim().length}/{MAX_NAME} · SAVED ON THIS DEVICE, NOT PUBLISHED
                    </PixelText>
                    <PixelButton
                      label="Save name"
                      onPress={async () => {
                        await rename(original.id, draftName);
                        setRenaming(false);
                      }}
                    />
                    {hasOverride ? (
                      <PixelButton
                        tone="panel"
                        label={
                          original.questTitle ? 'Use the generated name' : 'Use the syllabus title'
                        }
                        onPress={async () => {
                          await rename(original.id, '');
                          setDraftName('');
                          setRenaming(false);
                        }}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* What the syllabus calls it, shown only when the name above is not
                that — otherwise this is the same string printed twice. */}
            {original && nameSource !== 'syllabus' ? (
              <Field label="SYLLABUS SKILL" value={original.title} />
            ) : null}

            {original?.achievementTitle ? (
              <Field
                label="ACHIEVEMENT"
                value={original.achievementTitle}
                detail={original.achievementDescription ?? undefined}
              />
            ) : null}

            <CollapsibleSection title="Description">
              <PixelText variant="body" colour={t.ink} style={styles.detailContent}>
                {selected.description || 'No description has been added yet.'}
              </PixelText>
            </CollapsibleSection>

            {selected.moduleName || selected.difficultyLabel || selected.estimatedMinutes ? (
              <PixelText variant="micro" colour={t.inkMuted}>
                {[
                  selected.moduleName,
                  selected.difficultyLabel,
                  selected.estimatedMinutes ? `${selected.estimatedMinutes} MIN` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
                  .toUpperCase()}
              </PixelText>
            ) : null}

            {selected.learningObjective ? (
              <CollapsibleSection title="Learning objectives">
                <PixelText variant="body" colour={t.ink} style={styles.detailContent}>
                  {selected.learningObjective}
                </PixelText>
              </CollapsibleSection>
            ) : (
              <CollapsibleSection title="Learning objectives">
                <PixelText variant="body" colour={t.inkMuted} style={styles.detailContent}>
                  No learning objectives have been added yet.
                </PixelText>
              </CollapsibleSection>
            )}

            {selectedMissions.length > 0 ? (
              <CollapsibleSection
                title="Active missions"
                meta={`${nodeXpDone} OF ${nodeXpTotal} XP`}
              >

                <Meter
                  value={nodeProgress(selected, missions, completedMissionIds, isMastered)}
                  cells={16}
                  colour={isMastered ? t.earned : t.brand}
                  label={`${selected.title}: ${missionsDone} of ${selectedMissions.length} missions done`}
                />

                <PixelText variant="micro" colour={t.inkMuted}>
                  {isMastered
                    ? 'Every mission is done, so this skill is mastered.'
                    : status === 'locked'
                      ? 'This work opens once its prerequisites are cleared.'
                      : `${missionsDone} of ${selectedMissions.length} done.`}
                </PixelText>

                {selectedMissions.map(({ mission, state }) => (
                  <Pressable
                    key={mission.id}
                    disabled={state === 'locked'}
                    onPress={() => claimMission(mission.id, mission.title, mission.xpReward, state === 'done')}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: state === 'done', disabled: state === 'locked' }}
                    accessibilityLabel={`${mission.title}, ${mission.xpReward} XP`}
                    style={({ pressed }) => [
                      styles.missionRow,
                      bevelStyle(t, 'panel', pressed && state !== 'locked' ? 'inset' : 'raised'),
                    ]}
                  >
                    <View style={[styles.missionBox, { backgroundColor: t.well }]}>
                      {state === 'done' ? (
                        <PixelIcon name="check" size={14} colour={t.earnedText} />
                      ) : state === 'locked' ? (
                        <PixelIcon name="lock" size={12} colour={t.inkMuted} />
                      ) : null}
                    </View>
                    <View style={styles.missionBody}>
                      <View style={styles.rowBetween}>
                        <PixelText
                          variant="body"
                          colour={state === 'locked' ? t.inkMuted : t.ink}
                          style={styles.grow}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {mission.title}
                        </PixelText>
                        <PixelText
                          variant="micro"
                          colour={state === 'done' ? t.earnedText : t.inkMuted}
                        >
                          {mission.xpReward} XP
                        </PixelText>
                      </View>

                      <PixelText variant="micro" colour={t.inkMuted} numberOfLines={1}>
                        {mission.description || ' '}
                      </PixelText>

                      <View style={styles.previewMeta}>
                        <MissionDifficultyTag difficulty={missionDifficulty(mission, selected)} />
                        <PixelText variant="micro" colour={t.inkMuted}>
                        {[mission.kind, mission.estimatedMinutes ? `${mission.estimatedMinutes} MIN` : null]
                          .filter(Boolean)
                          .join(' · ')
                          .toUpperCase()}
                        </PixelText>
                      </View>

                      <PixelText
                        variant="micro"
                        colour={state === 'done' ? t.earnedText : t.inkMuted}
                        numberOfLines={1}
                      >
                        {state === 'done'
                          ? 'MARKED COMPLETE · TAP TO UNDO'
                          : state === 'locked'
                            ? 'LOCKED · CLEAR PREREQUISITES'
                            : 'READY · TAP TO CLAIM XP'}
                      </PixelText>
                    </View>
                    {claimedMissionId === mission.id ? (
                      <XpClaim xp={mission.xpReward} />
                    ) : null}
                  </Pressable>
                ))}
              </CollapsibleSection>
            ) : (
              <CollapsibleSection title="Active missions" meta="0 OF 0 XP">
                <PixelText variant="body" colour={t.inkMuted} style={styles.detailContent}>
                  This node has no attached missions. Use the completion control below.
                </PixelText>
              </CollapsibleSection>
            )}

            {helpOffer?.offer || confirmingHelp || helpNote ? (
              <Bevel tone="panel" depth="inset" style={styles.help}>
                <PixelText variant="micro" colour={t.inkMuted}>
                  EXTRA PRACTICE
                </PixelText>

                {confirmingHelp ? (
                  <>
                    <PixelText variant="body" colour={t.ink}>
                      This adds a few smaller steps under {selected.title} and makes them
                      prerequisites, so you clear them first.
                    </PixelText>
                    {/* The number matters and it is the one people get wrong: the
                        node is not topped up, its own reward is split. */}
                    <PixelText variant="body" colour={t.inkMuted}>
                      About {Math.round(HELP_SHARE * 100)}% of this node&apos;s{' '}
                      {selected.xpReward} XP moves onto the new steps. Finish everything and you
                      still earn {selected.xpReward} XP — the same as now.
                    </PixelText>
                    <PixelText variant="body" colour={t.inkMuted}>
                      It cannot be undone from here.
                    </PixelText>
                    <PixelButton
                      label={helpBusy ? 'Working…' : 'Add the steps'}
                      disabled={helpBusy}
                      onPress={requestHelp}
                    />
                    <PixelButton
                      tone="panel"
                      label="Not now"
                      disabled={helpBusy}
                      onPress={() => {
                        setConfirmingHelp(false);
                        setHelpNote(null);
                      }}
                    />
                  </>
                ) : (
                  <>
                    <PixelText variant="body" colour={t.ink}>
                      {helpOffer?.reason}
                    </PixelText>
                    {helpOffer?.offer ? (
                      <PixelButton
                        label="Break this into smaller steps"
                        onPress={() => setConfirmingHelp(true)}
                      />
                    ) : null}
                  </>
                )}

                {helpNote ? (
                  <PixelText variant="body" colour={t.alarm}>
                    {helpNote}
                  </PixelText>
                ) : null}
              </Bevel>
            ) : null}

            {/* Context is assembled here, where the selected syllabus node,
                missions and prerequisites are already in scope. */}
            {status === 'locked' ? null : (
              <Pressable
                onPress={() => setCompanionOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Ask the AI study companion about ${selected.title}.`}
                style={({ pressed }) => [
                  styles.companionRow,
                  bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
                ]}
              >
                <PixelIcon name="play" size={12} colour={t.info} />
                <PixelText variant="body" colour={t.ink} style={styles.requireLabel}>
                  Ask AI about this
                </PixelText>
                <PixelText variant="micro" colour={t.inkMuted}>
                  NODE CONTEXT
                </PixelText>
              </Pressable>
            )}

            {prereqNodes.length > 0 ? (
              <CollapsibleSection
                title="Prerequisites"
                meta={`${prereqsMastered} OF ${prereqNodes.length} MASTERED`}
              >

                {prereqNodes.map((p) => {
                  const done = masteredIds.includes(p.id);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setSelectedId(p.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.title}. ${done ? 'Mastered' : 'Not yet mastered'}. Open it.`}
                      style={({ pressed }) => [
                        styles.requireRow,
                        bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
                      ]}
                    >
                      <PixelIcon
                        name={done ? 'check' : 'lock'}
                        size={12}
                        colour={done ? t.earnedText : t.inkMuted}
                      />
                      <PixelText variant="body" colour={t.ink} style={styles.requireLabel}>
                        {p.title}
                      </PixelText>
                      <PixelText variant="micro" colour={t.info}>
                        VIEW
                      </PixelText>
                    </Pressable>
                  );
                })}
              </CollapsibleSection>
            ) : (
              <CollapsibleSection title="Prerequisites" meta="STARTING NODE">
                <PixelText variant="body" colour={t.inkMuted}>
                  This node has no prerequisites.
                </PixelText>
              </CollapsibleSection>
            )}
          </StableScrollView>

          {/* A node made of missions is finished by doing them, so it gets no
              button of its own — ticking the last mission is what completes it.
              The button exists only for a node that carries no work items. */}
          {selectedMissions.length > 0 ? null : status === 'available' ? (
            <PixelButton label="Mark complete" onPress={() => onComplete(selected)} />
          ) : status === 'mastered' ? (
            <View style={styles.clearedRow}>
              <PixelIcon name="check" size={16} colour={t.earnedText} />
              <PixelText variant="label" colour={t.earnedText}>
                Marked complete
              </PixelText>
            </View>
          ) : (
            <PixelText variant="micro" colour={t.inkMuted}>
              Clear the nodes above to open this one.
            </PixelText>
          )}
        </Window>
        </Animated.View>
        <StudyCompanionDrawer
          visible={companionOpen}
          onClose={() => setCompanionOpen(false)}
          courseId={courseId}
          courseTitle={title}
          node={selected}
          missions={selectedMissions.map(({ mission }) => mission)}
          prerequisites={prereqNodes}
          reduceMotion={prefs.motionOff}
        />
        </>
      ) : editMode ? null : next ? (
        <Pressable
          onPress={() => setSelectedId(next.id)}
          accessibilityRole="button"
          accessibilityLabel={`Next: ${next.title}, worth ${next.xpReward} XP. Open details.`}
          style={({ pressed }) => [
            styles.nextBar,
            wide ? styles.nextBarWide : null,
            bevelStyle(t, 'brand', pressed ? 'inset' : 'raised'),
          ]}
        >
          <PixelIcon name="play" size={16} colour={t.ink} />
          <PixelText variant="label" numberOfLines={1} style={styles.nextLabel}>
            {next.title}
          </PixelText>
          <PixelText variant="micro" colour={t.ink}>
            {next.xpReward} XP
          </PixelText>
        </Pressable>
      ) : (
        <Bevel tone="earned" style={[styles.nextBar, wide ? styles.nextBarWide : null]}>
          <PixelIcon name="check" size={16} colour={t.well} />
          <PixelText variant="label" colour={t.well} style={styles.nextLabel}>
            Every node cleared
          </PixelText>
        </Bevel>
      )}
      </View>
      <PracticeCopyPrompt
        visible={practiceCopyOpen}
        courseTitle={title}
        courseKind={currentCourse?.kind ?? 'practice'}
        busy={practiceCopyBusy}
        error={practiceCopyError}
        reduceMotion={prefs.motionOff}
        onCancel={() => {
          if (practiceCopyBusy) return;
          setPracticeCopyOpen(false);
          setPracticeCopyError(null);
        }}
        onConfirm={createPracticeCopy}
      />
    </View>
  );
}

/** A labelled fact in the detail panel. Label is chrome, value is content. */
function Field({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <PixelText variant="micro" colour={t.inkMuted}>
        {label}
      </PixelText>
      <PixelText variant="body" colour={t.ink}>
        {value}
      </PixelText>
      {detail ? (
        <PixelText variant="micro" colour={t.inkMuted}>
          {detail}
        </PixelText>
      ) : null}
    </View>
  );
}

function MissionDifficultyTag({ difficulty }: { difficulty: ReturnType<typeof missionDifficulty> }) {
  const t = useTheme();
  const colour = difficulty === 'easy' ? t.success : difficulty === 'medium' ? t.warning : t.alarm;
  return (
    <View style={[styles.detailBadge, { borderColor: colour, backgroundColor: t.well }]}>
      <PixelText variant="micro" colour={colour}>{difficulty.toUpperCase()}</PixelText>
    </View>
  );
}

function CollapsibleSection({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const { motionOff } = usePrefs();
  const [open, setOpen] = useState(true);
  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${open ? 'Collapse' : 'Expand'}.`}
        style={({ pressed }) => [
          styles.sectionHeader,
          bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
        ]}
      >
        <PixelText variant="micro" colour={t.info} style={styles.sectionHeadingText}>
          {title.toUpperCase()}
        </PixelText>
        <View style={styles.sectionMeta}>
          {meta ? <PixelText variant="micro" colour={t.inkMuted} style={styles.detailMetaText}>{meta}</PixelText> : null}
          <PixelText variant="micro" colour={t.info}>{open ? '−' : '+'}</PixelText>
        </View>
      </Pressable>
      <SmoothCollapse open={open} reduceMotion={motionOff}>
        <View style={styles.sectionBody}>{children}</View>
      </SmoothCollapse>
    </View>
  );
}

function SmoothCollapse({ open, reduceMotion, children }: {
  open: boolean;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const measuredHeight = useSharedValue(0);
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: reduceMotion ? 0 : 250,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [open, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: measuredHeight.value * progress.value,
    opacity: progress.value,
  }));

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      style={[styles.collapseClip, animatedStyle]}
    >
      <View onLayout={(event) => { measuredHeight.value = event.nativeEvent.layout.height; }}>
        {children}
      </View>
    </Animated.View>
  );
}

function XpClaim({ xp }: { xp: number }) {
  const t = useTheme();
  const rise = useSharedValue(0);
  useEffect(() => {
    rise.value = withTiming(1, { duration: 600 });
  }, [rise]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - rise.value,
    transform: [{ translateY: -16 * rise.value }],
  }));
  return (
    <Animated.View
      style={[styles.xpClaim, animatedStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <PixelText variant="label" colour={t.earnedText}>+{xp} XP CLAIMED</PixelText>
    </Animated.View>
  );
}

function Loading() {
  const t = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <Backdrop />
      <View style={styles.centred}>
        <Window title="Reading chart" live={false} style={styles.notice}>
          <PixelText variant="body" colour={t.inkMuted}>
            00: OPENING COURSE
          </PixelText>
          <PixelText variant="body" colour={t.inkMuted}>
            01: BUILDING PREREQUISITES
          </PixelText>
        </Window>
      </View>
    </View>
  );
}

function Failed({
  currentCourseId,
  currentTitle,
  detail,
  courses,
  reduceMotion,
  onRetry,
  onUpload,
  onSelect,
}: {
  currentCourseId: string;
  currentTitle: string;
  detail: string;
  courses: readonly CourseOption[];
  reduceMotion: boolean;
  onRetry: () => void;
  onUpload: () => void;
  onSelect: (courseId: string) => void;
}) {
  const t = useTheme();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);
  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <Backdrop />
      <View
        style={[
          styles.marginalia,
          styles.failedHeader,
          {
            paddingTop: insets.top + space.cell,
            backgroundColor: theme.hudBackground,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <CourseSelector
          open={courseMenuOpen}
          currentCourseId={currentCourseId}
          currentTitle={currentTitle}
          courses={courses}
          reduceMotion={reduceMotion}
          managementDisabled
          onToggle={() => setCourseMenuOpen((open) => !open)}
          onSelect={(nextCourseId) => {
            setCourseMenuOpen(false);
            onSelect(nextCourseId);
          }}
          onUpdate={unavailableCourseManagement}
          onReset={unavailableCourseManagement}
          onShare={unavailableCourseManagement}
          onArchive={unavailableCourseManagement}
          onDuplicate={unavailableCourseManagement}
          onDelete={unavailableCourseManagement}
        />
        <Pressable
          onPress={onUpload}
          accessibilityRole="button"
          accessibilityLabel="Upload a syllabus"
          style={({ pressed }) => [
            styles.uploadButton,
            bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
          ]}
        >
          <PixelIcon name="plus" size={12} colour={t.info} />
          <PixelText variant="micro" colour={t.ink}>UPLOAD</PixelText>
        </Pressable>
      </View>
      <View style={styles.centred}>
        <Window title="Chart unavailable" style={styles.notice}>
          <PixelText variant="body" colour={t.ink}>
            {detail}
          </PixelText>
          <PixelButton label="Retry" onPress={onRetry} />
          <PixelButton
            label="Switch course"
            tone="panel"
            onPress={() => setCourseMenuOpen(true)}
          />
        </Window>
      </View>
    </View>
  );
}

function readableError(cause: unknown): string {
  if (cause && typeof cause === 'object' && 'message' in cause) {
    const message = String(cause.message).trim();
    if (message) return `Couldn't load this chart: ${message}`;
  }
  return "Couldn't load this chart. Check your connection and try again.";
}

function EmptyChart({ title, onEdit, onCourses, onUpload }: {
  title: string;
  onEdit: () => void;
  onCourses: () => void;
  onUpload: () => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <Backdrop />
      <View style={styles.centred}>
        <Window title={title} style={styles.notice}>
          <PixelText variant="body" colour={t.ink}>
            This blank course is ready for its first skill. Start editing to add and connect nodes.
          </PixelText>
          <PixelButton label="+ Add first node" onPress={onEdit} />
          <PixelButton label="Back to courses" tone="panel" onPress={onCourses} />
          <PixelButton label="Upload a syllabus instead" tone="panel" onPress={onUpload} />
        </Window>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
  notice: { width: '100%', maxWidth: 420 },

  marginalia: {
    zIndex: 30,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingBottom: space.cell,
    borderBottomWidth: bevel,
  },
  failedHeader: { alignItems: 'center' },
  courseBlock: { flexShrink: 1, gap: space.hair, zIndex: 20 },
  courseActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.cell },
  uploadButton: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.cell,
  },
  readout: { alignItems: 'flex-end', gap: space.xs },
  streak: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  fill: { flex: 1 },
  // No `alignItems` here on purpose: the default is `stretch`, and the chart
  // column needs the row's full height. Setting it to `flex-start` collapsed the
  // chart to zero height and rendered an empty canvas.
  wideBody: { flex: 1, flexDirection: 'row', position: 'relative' },
  dock: { margin: space.cell },
  detailWindow: { width: '100%' },
  // The panel sits in its own column but must not be stretched to the row's
  // height by the `stretch` default above.
  dockWide: { width: 420, margin: space.cell, maxHeight: '100%', alignSelf: 'flex-start' },
  // The compact next action floats over the chart. Keeping it as a flex-row
  // sibling reserved an empty full-height column that looked like a wall.
  nextBarWide: {
    position: 'absolute',
    right: space.cell,
    bottom: space.cell,
    width: DOCK_WIDTH,
    margin: 0,
  },
  sheetScroll: { maxHeight: 260 },
  sheetScrollWide: { maxHeight: 460 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTags: { gap: space.xs },
  naming: { gap: space.xs, marginBottom: space.cell },
  editProperties: { gap: space.cell, marginBottom: space.md },
  editForm: { gap: space.cell },
  localMissionTools: { gap: space.xs },
  missionEditRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.xs,
    borderWidth: bevel,
    padding: space.xs,
  },
  missionTitleEdit: { minWidth: 0, flex: 1 },
  missionXpEdit: { width: 88 },
  missionDelete: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  iconChoices: { gap: space.xs, paddingVertical: space.xs },
  iconChoice: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  livePreview: { borderWidth: bevel, padding: space.cell, gap: space.cell },
  previewNodeRow: { flexDirection: 'row', alignItems: 'center', gap: space.cell },
  previewNode: { width: touch, height: touch, borderWidth: bevel, alignItems: 'center', justifyContent: 'center' },
  previewMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.cell },
  detailBadge: { minHeight: 28, borderWidth: bevel, justifyContent: 'center', paddingHorizontal: space.cell },
  renameToggle: { minHeight: touch, justifyContent: 'center', paddingLeft: space.md },
  renameForm: { gap: space.cell, marginTop: space.xs },
  objective: { marginTop: space.cell, gap: space.hair },
  section: { marginTop: space.cell },
  sectionHeader: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.cell,
  },
  sectionMeta: { flexDirection: 'row', alignItems: 'center', gap: space.cell },
  sectionBody: { gap: space.xs, paddingTop: space.cell },
  collapseClip: { overflow: 'hidden' },
  sectionHeadingText: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  detailContent: { fontSize: 12, lineHeight: 17 },
  detailMetaText: { fontSize: 10, lineHeight: 14, textTransform: 'uppercase' },
  field: { gap: space.hair },
  grow: { flex: 1 },
  missions: { marginTop: space.md, gap: space.xs },
  help: { marginTop: space.md, padding: space.cell, gap: space.cell },
  missionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    height: 112,
    paddingHorizontal: space.cell,
    position: 'relative',
  },
  missionBox: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionBody: { flex: 1, gap: space.hair },
  xpClaim: { position: 'absolute', right: space.cell, top: space.cell, zIndex: 2 },
  requires: { marginTop: space.md, gap: space.xs },
  requireRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    minHeight: touch,
    paddingHorizontal: space.cell,
  },
  requireLabel: { flexShrink: 1 },
  companionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    minHeight: touch,
    paddingHorizontal: space.cell,
    marginTop: space.md,
  },
  clearedRow: { flexDirection: 'row', alignItems: 'center', gap: space.cell, minHeight: touch },

  nextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    margin: space.cell,
    minHeight: touch,
    paddingHorizontal: space.md,
  },
  nextLabel: { flex: 1 },
});
