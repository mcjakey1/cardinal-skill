import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
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
import { CourseOutlineItem } from '@/features/skilltree/CourseOutlineItem';
import { NodeMissionCard } from '@/features/skilltree/NodeMissionCard';
import { NodeAiCoach, type CoachAction } from '@/features/skilltree/NodeAiCoach';
import { streakDays } from '@/features/skilltree/achievements';
import { rankNextQuests, shouldOfferHelp } from '@/features/skilltree/adaptive';
import { effectiveMissionCompletionIds, missionStates, nodeXpEarned, nodeXpFromMissions } from '@/features/skilltree/missions';
import { MAX_NAME, resolveQuestName, type NameSource } from '@/features/skilltree/naming';
import { learnerSignals, nodeSignal } from '@/features/skilltree/observed';
import { courseOutline } from '@/features/skilltree/courseOutline';
import { groupOutlineByModule, type OutlineModule } from '@/features/skilltree/courseOutlineGroups';
import {
  evaluateSkillUnlockState,
  levelForXp,
  progressRatio,
  totalXp,
} from '@/features/skilltree/progression';
import { HELP_SHARE } from '@/features/skilltree/subtree';
import { fetchTree, treeQueryKeys } from '@/features/skilltree/queries';
import { CourseUnavailableError } from '@/features/skilltree/courseAvailability';
import {
  deleteCourse,
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
import { displayStatus } from '@/features/skilltree/nodeVisualState';
import { NodeEditorPanel } from '@/features/skilltree/NodeEditorPanel';
import { linkRefusal, type NodeEdit } from '@/features/skilltree/nodeEditing';
import type { Mission, SkillNode, Tree } from '@/features/skilltree/types';
import { DOCK_WIDTH, useWide } from '@/lib/layout';
import { useNodeLayout, type NodePosition } from '@/lib/nodeLayout';
import { useEditedTree } from '@/lib/editedTree';
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
  bevelStyle,
} from '@/ui/pixel';

/** Where the name on screen came from. A word, never a colour. */
const NAME_SOURCE: Record<NameSource, string> = {
  override: 'RENAMED BY HAND',
  generated: 'GENERATED NAME',
  syllabus: 'SYLLABUS TITLE',
};

type DrawerMode = 'details' | 'outline';

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
  const { lastCourseId, set: setPreference } = prefs;
  const wide = useWide();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('outline');
  const [justCompleted, setJustCompleted] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [confirmingHelp, setConfirmingHelp] = useState(false);
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpNote, setHelpNote] = useState<string | null>(null);
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [companionPrompt, setCompanionPrompt] = useState<{ key: number; text: string } | null>(null);
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
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const claimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledLocateRequest = useRef<string | null>(null);
  const linkNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const companionPromptKey = useRef(0);

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
    setDrawerMode('outline');
    setLinkMode(false);
    setLinkSourceId(null);
  }, [courseId, edit]);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: treeQueryKeys.authoring(courseId),
    queryFn: () => fetchTree(courseId),
    enabled: Boolean(courseId),
  });
  const { data: courseOptions = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: fetchCourseOptions,
  });
  const currentCourse = courseOptions.find((course) => course.id === courseId) ?? null;

  useEffect(() => {
    if (!(error instanceof CourseUnavailableError)) return;
    if (lastCourseId === courseId) setPreference('lastCourseId', null);
    router.replace('/courses');
  }, [courseId, error, lastCourseId, router, setPreference]);

  const requestEditMode = useCallback((next: boolean) => {
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
  }, [currentCourse]);

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
    setDrawerMode('details');
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

  // The outline, the meters on the chart and the detail header all read one
  // walk of the tree. Doing it here rather than in the body keeps it off every
  // keystroke in the rename field.
  const outline = useMemo(
    () => merged && courseOutline({
      tree,
      missions: sourceMissions,
      completedMissionIds: merged.completedMissionIds,
      masteredIds: merged.masteredIds,
      selectedId,
    }),
    [merged, selectedId, sourceMissions, tree],
  );

  if (isPending || !editedTreeReady || !progressReady) return <Loading />;
  if (error || !data || !merged || !outline) {
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
        // The same test `requestEditMode` makes. Offering "Add first node" to a
        // reader who cannot author routes them into the practice-copy prompt
        // instead — a control that does not do what its label says.
        canAuthor={!currentCourse || currentCourse.isFixture || currentCourse.canEdit}
        onEdit={() => requestEditMode(true)}
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
  const activeMission = selectedMissions.find(({ state }) => state === 'open')?.mission
    ?? selectedMissions[0]?.mission
    ?? null;
  const missionsDone = selectedMissions.filter((m) => m.state === 'done').length;
  const outlineEntries = [
    ...outline.before,
    ...(outline.current ? [outline.current] : []),
    ...outline.after,
  ];
  const outlineModules = groupOutlineByModule(outlineEntries);

  // XP rather than a count, because that is what the work is actually worth and
  // two missions on one node are rarely worth the same.
  const nodeXpTotal = selected ? nodeXpFromMissions(missions, selected.id) : 0;
  const nodeXpDone = selected ? nodeXpEarned(missions, selected.id, completedMissionIds) : 0;
  const detailStatus = displayStatus(
    status,
    selected ? nodeProgress(selected, missions, completedMissionIds, isMastered) : 0,
  );

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
  const downstreamNodes = selected
    ? tree.prereqs
        .filter((edge) => edge.prereqId === selected.id)
        .map((edge) => tree.nodes.find((node) => node.id === edge.nodeId))
        .filter((node): node is SkillNode => Boolean(node))
    : [];

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
      const refusal = linkRefusal(sourceTree?.nodes ?? [], tree.prereqs, linkSourceId, node.id);
      if (refusal) {
        showLinkNotice(refusal);
        return;
      }
      const edge = { prereqId: linkSourceId, nodeId: node.id };
      const prereqs = [...tree.prereqs.filter((item) => !(item.prereqId === edge.prereqId && item.nodeId === edge.nodeId)), edge];
      await persistEdit({ nodes: sourceTree?.nodes ?? [], prereqs });
      AccessibilityInfo.announceForAccessibility(`Connected ${sourceTree?.nodes.find((item) => item.id === linkSourceId)?.title ?? 'source'} to ${node.title}.`);
      setLinkNotice('Nodes connected');
      cancelLink();
      setSelectedId(node.id);
      return;
    }
    setSelectedId(node.id);
    setDrawerMode('details');
    setRenaming(false);
    setConfirmingHelp(false);
    setHelpNote(null);
  };

  const focusFromOutline = async (node: SkillNode) => {
    await selectNode(node);
    setLocatedNodeId(node.id);
    setCameraFocusRequest((request) => request + 1);
    if (locateTimer.current) clearTimeout(locateTimer.current);
    locateTimer.current = setTimeout(
      () => setLocatedNodeId((current) => (current === node.id ? null : current)),
      prefs.motionOff ? 0 : 1200,
    );
  };

  const openCoach = (action: CoachAction, mission: Mission | null = activeMission) => {
    if (!selected) return;
    const missionContext = mission
      ? ` The active mission is “${mission.title}”: ${mission.description}`
      : '';
    const prompt = action === 'explain'
      ? `Explain ${selected.title} step by step in simple language, then give one short example.`
      : action === 'hint'
        ? `Give me one useful hint for this mission without revealing the full answer.${missionContext}`
        : action === 'quiz'
          ? `Create a three-question practice quiz for ${selected.title}. Ask one question at a time and wait for my answer.`
          : null;
    companionPromptKey.current += 1;
    setCompanionPrompt(prompt ? { key: companionPromptKey.current, text: prompt } : null);
    setCompanionOpen(true);
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
  };

  /**
   * DELETE NODE asks first, and the question names what it is about to destroy.
   *
   * The delete is a rewrite of the saved chart with the node, its edges and its
   * missions dropped, so there is nothing to undo it with — a reload reads the
   * shortened chart back. Undo is a feature; naming the node and the XP is the
   * fix, because "are you sure?" and "Delete Midterm? It is worth 150 XP." fail
   * in different places, and only the second one stops the wrong tap.
   */
  const deleteTarget = deleteTargetId
    ? named.find((node) => node.id === deleteTargetId) ?? null
    : null;
  const deleteTargetMissions = deleteTargetId
    ? missions.filter((mission) => mission.skillId === deleteTargetId).length
    : 0;

  const deleteSelectedNode = async () => {
    const id = deleteTargetId;
    setDeleteTargetId(null);
    if (!sourceTree || !id) return;
    await persistEdit(
      {
        nodes: sourceTree.nodes.filter((node) => node.id !== id),
        prereqs: sourceTree.prereqs.filter((edge) => edge.nodeId !== id && edge.prereqId !== id),
      },
      missions.filter((mission) => mission.skillId !== id),
    );
    setSelectedId((current) => (current === id ? null : current));
  };

  /**
   * The shared editor's half of the persistence contract, device-local side.
   *
   * A Playground edit is this student's arrangement of someone else's chart, so
   * it lands in the AsyncStorage snapshot and nowhere else. The instructor
   * surface hands the same `NodeEdit` to its publish draft instead.
   */
  const saveNodeEdit = async (next: NodeEdit) => {
    if (!sourceTree || !original) return;
    const nextNodes = sourceTree.nodes.map((node) => node.id === original.id
      ? {
          ...node,
          // The typed name is an override; the syllabus title stays underneath
          // so clearing the override falls back to it rather than to nothing.
          titleOverride: next.titleOverride,
          description: next.description,
          kind: next.kind,
          xpReward: next.xpReward,
          iconKey: next.iconKey,
          trackId: next.universal ? (node.trackId ?? `local-universal-${node.id}`) : null,
          courseId: next.universal ? null : courseId,
        }
      : node);
    const nextMissions = [
      ...missions.filter((mission) => mission.skillId !== original.id),
      ...next.missions,
    ];
    await persistEdit({ ...sourceTree, nodes: nextNodes }, nextMissions);
    setEditingProperties(false);
  };

  const unlinkPrereq = async (prereqId: string) => {
    if (!sourceTree || !original) return;
    await persistEdit({
      ...sourceTree,
      prereqs: sourceTree.prereqs.filter(
        (edge) => !(edge.nodeId === original.id && edge.prereqId === prereqId),
      ),
    });
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
      await queryClient.invalidateQueries({ queryKey: ['tree'] });
      AccessibilityInfo.announceForAccessibility('Course details saved.');
    } catch {
      AccessibilityInfo.announceForAccessibility('Course details could not be saved. Check your connection and try again.');
      throw new Error('Course details could not be saved. Check your connection and try again.');
    }
  };

  const deleteTree = async (targetCourseId: string) => {
    if (findMockCourse(targetCourseId) || targetCourseId === 'demo') return;
    try {
      await deleteCourse(targetCourseId);
      if (targetCourseId === courseId) await clearEditedTree();
      if (lastCourseId === targetCourseId) setPreference('lastCourseId', null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] === 'tree' && query.queryKey.includes(targetCourseId),
      });
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
      await publishCommunityCourse(targetCourseId, visibility);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['course-catalog'] }),
      ]);
      AccessibilityInfo.announceForAccessibility('Community sharing updated.');
    } catch (cause) {
      throw cause instanceof Error
        ? cause
        : new Error('Community publishing failed. Check your connection and try again.');
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
        : 'The Playground copy could not be created. Check your connection and try again.');
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
        onToggleEditMode={requestEditMode}
        onAddNode={addNode}
        onToggleLinkMode={startLink}
        onCancelLink={cancelLink}
        onDeleteNode={() => setDeleteTargetId(selectedId)}
        recommendedId={next?.id ?? null}
        recentlyMasteredId={justCompleted}
        reduceMotion={prefs.motionOff}
        lowBandwidth={prefs.lowBandwidth}
        positions={positions}
        onMoveNode={moveNode}
        onResetLayout={resetLayout}
        progressByNode={outline.progressByNode}
        focusRequestKey={cameraFocusRequest}
        focusNodeId={locatedNodeId}
        focusNodeRequestKey={cameraFocusRequest}
      />
        </View>

      {selected && eligibility ? (
        <>
        <Animated.View
          entering={prefs.motionOff ? undefined : SlideInRight.duration(280).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          exiting={prefs.motionOff ? undefined : SlideOutRight.duration(220).easing(Easing.in(Easing.cubic))}
          style={wide ? styles.dockWide : styles.dock}
        >
        <Window
          title="Node navigator"
          onClose={() => setSelectedId(null)}
          style={styles.detailWindow}
        >
          <DrawerModeToggle
            value={drawerMode}
            mastered={outline.masteredCount}
            total={outline.total}
            onChange={setDrawerMode}
          />
          <StableScrollView
            style={wide ? styles.sheetScrollWide : styles.sheetScroll}
            contentContainerStyle={styles.drawerScrollContent}
            showsVerticalScrollIndicator
          >
            {drawerMode === 'outline' ? (
              <>
                <View style={styles.outlineIntro}>
                  <PixelText variant="label" colour={t.ink}>COURSE OUTLINE</PixelText>
                  <PixelText variant="micro" colour={t.inkMuted}>
                    {outline.masteredCount} OF {outline.total} NODES MASTERED
                  </PixelText>
                </View>
                <View style={styles.moduleList}>
                  {outlineModules.map((module) => (
                    <OutlineModuleAccordion
                      key={module.title}
                      module={module}
                      selectedId={selectedId}
                      reduceMotion={prefs.motionOff}
                      onSelect={focusFromOutline}
                    />
                  ))}
                </View>
              </>
            ) : <>
            <View style={styles.selectedNodeHeader}>
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
              <PixelText variant="title" colour={t.ink}>{selected.title}</PixelText>
            </View>
            {editMode ? (
              <View style={styles.editProperties}>
                {editingProperties && original ? (
                  <NodeEditorPanel
                    key={original.id}
                    node={original}
                    missions={missions.filter((mission) => mission.skillId === original.id)}
                    prereqs={prereqNodes}
                    onUnlink={unlinkPrereq}
                    status={detailStatus}
                    reduceMotion={prefs.motionOff}
                    onSave={saveNodeEdit}
                    onCancel={() => setEditingProperties(false)}
                  />
                ) : (
                  <PixelButton
                    tone="panel"
                    label="Rename / edit properties"
                    onPress={() => setEditingProperties(true)}
                  />
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
                  <NodeMissionCard
                    key={mission.id}
                    mission={mission}
                    node={selected}
                    state={state}
                    claimed={claimedMissionId === mission.id}
                    reduceMotion={prefs.motionOff}
                    onToggle={() => claimMission(
                      mission.id,
                      mission.title,
                      mission.xpReward,
                      state === 'done',
                    )}
                    onHint={() => openCoach('hint', mission)}
                    onCriteria={() => {
                      companionPromptKey.current += 1;
                      setCompanionPrompt({
                        key: companionPromptKey.current,
                        text: `Give me a concise completion checklist for “${mission.title}” without solving it for me. The mission is: ${mission.description}`,
                      });
                      setCompanionOpen(true);
                    }}
                  />
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

            {status === 'locked' ? null : <NodeAiCoach onAction={openCoach} />}

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
                      onPress={() => void focusFromOutline(p)}
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

            <CollapsibleSection
              title="Downstream unlocks"
              meta={`${downstreamNodes.length} NEXT`}
            >
              {downstreamNodes.length > 0 ? downstreamNodes.map((node) => (
                <Pressable
                  key={node.id}
                  onPress={() => void focusFromOutline(node)}
                  accessibilityRole="button"
                  accessibilityLabel={`${node.title}. Open downstream node.`}
                  style={({ pressed }) => [
                    styles.requireRow,
                    bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
                  ]}
                >
                  <PixelIcon name="link" size={12} colour={t.info} />
                  <PixelText variant="body" colour={t.ink} style={styles.requireLabel}>
                    {node.title}
                  </PixelText>
                  <PixelText variant="micro" colour={t.info}>VIEW</PixelText>
                </Pressable>
              )) : (
                <PixelText variant="body" colour={t.inkMuted}>
                  This is the end of its current branch.
                </PixelText>
              )}
            </CollapsibleSection>
            </>}
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
          initialPrompt={companionPrompt}
        />
        </>
      ) : editMode ? null : next ? (
        <Pressable
          onPress={() => void selectNode(next)}
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

      {/* `Window` is already a live region, so mounting this announces the
          question, and the modal moves focus onto Keep node. Escape and the
          hardware back button cancel. */}
      <Modal
        visible={deleteTarget !== null}
        animationType={prefs.motionOff ? 'none' : 'fade'}
        presentationStyle="fullScreen"
        onRequestClose={() => setDeleteTargetId(null)}
      >
        <View
          style={[styles.confirmScreen, { backgroundColor: t.ground, paddingTop: insets.top }]}
          accessibilityViewIsModal
        >
          <Window title="Delete node?" style={styles.confirmDialog}>
            <PixelText variant="body" colour={t.ink}>
              Delete {deleteTarget?.title}? It is worth {deleteTarget?.xpReward ?? 0} XP
              {deleteTargetMissions > 0
                ? ` and carries ${deleteTargetMissions} mission${deleteTargetMissions === 1 ? '' : 's'}`
                : ''}
              , and its connections go with it. This cannot be undone.
            </PixelText>
            <View style={styles.confirmActions}>
              <PixelButton label="Keep node" tone="panel" grow={false} onPress={() => setDeleteTargetId(null)} />
              <PixelButton label="Delete node" grow={false} onPress={deleteSelectedNode} />
            </View>
          </Window>
        </View>
      </Modal>
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

function DrawerModeToggle({ value, mastered, total, onChange }: {
  value: DrawerMode;
  mastered: number;
  total: number;
  onChange: (mode: DrawerMode) => void;
}) {
  const t = useTheme();
  const options: { value: DrawerMode; label: string; icon: 'chart' | 'stack' }[] = [
    { value: 'details', label: 'Node details', icon: 'chart' },
    { value: 'outline', label: `Outline (${mastered}/${total})`, icon: 'stack' },
  ];
  return (
    <View style={styles.drawerModes} accessibilityRole="radiogroup" accessibilityLabel="Drawer view">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={option.value === 'details'
              ? 'Node details'
              : `Course outline, ${mastered} of ${total} mastered`}
            style={({ pressed }) => [
              styles.drawerMode,
              bevelStyle(t, active ? 'brand' : 'panel', active || pressed ? 'inset' : 'raised'),
            ]}
          >
            <PixelIcon name={option.icon} size={12} colour={active ? t.brandInk : t.info} />
            <PixelText variant="micro" colour={active ? t.brandInk : t.inkMuted} numberOfLines={2} centred>
              {option.label.toUpperCase()}
            </PixelText>
          </Pressable>
        );
      })}
    </View>
  );
}

function OutlineModuleAccordion({
  module,
  selectedId,
  reduceMotion,
  onSelect,
}: {
  module: OutlineModule;
  selectedId: string | null;
  reduceMotion: boolean;
  onSelect: (node: SkillNode) => void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(
    () => module.entries.some((entry) => entry.node.id === selectedId),
  );
  return (
    <View style={styles.module}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${module.title}. ${module.mastered} of ${module.entries.length} cleared. ${open ? 'Collapse' : 'Expand'}.`}
        style={({ pressed }) => [
          styles.moduleHeader,
          bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
        ]}
      >
        <View style={styles.moduleHeadingCopy}>
          <PixelText variant="body" colour={t.ink}>{module.title}</PixelText>
          <PixelText variant="micro" colour={t.inkMuted}>
            {module.mastered}/{module.entries.length} CLEARED
          </PixelText>
        </View>
        <PixelIcon name={open ? 'minus' : 'plus'} size={12} colour={t.info} />
      </Pressable>
      <SmoothCollapse open={open} reduceMotion={reduceMotion}>
        <View style={styles.moduleEntries}>
          {module.entries.map((entry) => (
            <CourseOutlineItem
              key={entry.node.id}
              entry={entry}
              active={entry.node.id === selectedId}
              reduceMotion={reduceMotion}
              onPress={() => onSelect(entry.node)}
            />
          ))}
        </View>
      </SmoothCollapse>
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
          <PixelIcon name={open ? 'minus' : 'plus'} size={12} colour={t.info} />
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
      duration: reduceMotion ? 0 : 220,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
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

function EmptyChart({ title, canAuthor, onEdit, onCourses, onUpload }: {
  title: string;
  canAuthor: boolean;
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
            {canAuthor
              ? 'This blank course is ready for its first skill. Start editing to add and connect nodes.'
              : 'This course has no skills in it yet. Whoever runs it adds them — come back once they have.'}
          </PixelText>
          {canAuthor ? <PixelButton label="+ Add first node" onPress={onEdit} /> : null}
          <PixelButton
            label="Back to courses"
            tone={canAuthor ? 'panel' : undefined}
            onPress={onCourses}
          />
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
  confirmScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
  confirmDialog: { width: '100%', maxWidth: 540 },
  confirmActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.cell },

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
  drawerModes: { flexDirection: 'row', minHeight: touch, alignItems: 'stretch' },
  drawerMode: {
    flex: 1,
    minWidth: 0,
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
  },
  drawerScrollContent: { paddingTop: space.md, paddingBottom: space.xl + space.cell },
  outlineIntro: { gap: space.hair, paddingBottom: space.cell },
  moduleList: { gap: space.cell },
  module: { gap: space.xs },
  moduleHeader: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.cell,
    paddingHorizontal: space.cell,
  },
  moduleHeadingCopy: { flex: 1, minWidth: 0, gap: space.hair },
  moduleEntries: { gap: space.xs, paddingTop: space.xs, paddingLeft: space.cell },
  selectedNodeHeader: { gap: space.xs, marginTop: space.md, paddingTop: space.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTags: { gap: space.xs },
  naming: { gap: space.xs, marginBottom: space.cell },
  editProperties: { gap: space.cell, marginBottom: space.md },
  renameToggle: { minHeight: touch, justifyContent: 'center', paddingLeft: space.md },
  renameForm: { gap: space.cell, marginTop: space.xs },
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
  help: { marginTop: space.md, padding: space.cell, gap: space.cell },
  requireRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    minHeight: touch,
    paddingHorizontal: space.cell,
  },
  requireLabel: { flexShrink: 1 },
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
