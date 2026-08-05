import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SkillTree } from '@/features/skilltree/SkillTree';
import { streakDays } from '@/features/skilltree/achievements';
import { rankNextQuests, shouldOfferHelp } from '@/features/skilltree/adaptive';
import { missionStates, nodeXpEarned, nodeXpFromMissions } from '@/features/skilltree/missions';
import { MAX_NAME, resolveQuestName, type NameSource } from '@/features/skilltree/naming';
import { learnerSignals, nodeSignal } from '@/features/skilltree/observed';
import {
  evaluateSkillUnlockState,
  levelForXp,
  levelProgress,
  totalXp,
} from '@/features/skilltree/progression';
import { HELP_SHARE } from '@/features/skilltree/subtree';
import { fetchTree } from '@/features/skilltree/queries';
import { nodeProgress, rollUpProgress } from '@/features/skilltree/rollup';
import type { SkillNode, Tree } from '@/features/skilltree/types';
import { DOCK_WIDTH, useWide } from '@/lib/layout';
import { useNodeLayout } from '@/lib/nodeLayout';
import { usePrefs } from '@/lib/prefs';
import { useLocalProgress } from '@/lib/progress';
import { useQuestNames } from '@/lib/questNames';
import { useSignals } from '@/lib/signals';
import { supabase } from '@/lib/supabase';
import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { Window } from '@/ui/Window';
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

export default function TreeScreen() {
  const t = useTheme();
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const router = useRouter();
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

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['tree', courseId],
    queryFn: () => fetchTree(courseId),
    enabled: Boolean(courseId),
  });

  const { log, missionLog, complete, toggleMission } = useLocalProgress(courseId);
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

  const merged = useMemo(() => {
    if (!data) return null;
    return rollUpProgress({
      tree: data.tree,
      missions: data.missions,
      // The server's record and this device's record are both true; a student
      // on a metered connection completes work offline and syncs later.
      completedMissionIds: [...data.completedMissionIds, ...Object.keys(missionLog)],
      directlyCompletedIds: Object.keys(log),
      serverMasteredIds: data.masteredIds,
      serverXp: data.xp,
    });
  }, [data, log, missionLog]);

  // One name per node, resolved once. The chart, the detail window, the REQUIRES
  // list and the "what next" bar all read from here, because two surfaces
  // calling the same node different things reads as two different nodes.
  const named = useMemo<SkillNode[]>(
    () =>
      data?.tree.nodes.map((n) => ({ ...n, title: resolveQuestName(n, overrides[n.id]).text })) ??
      [],
    [data, overrides],
  );

  const selected = useMemo<SkillNode | null>(
    () => named.find((n) => n.id === selectedId) ?? null,
    [named, selectedId],
  );

  // The node as it arrived, for the rename form: `selected.title` is already the
  // resolved name, so editing against it would treat a generated name as
  // something a person had typed.
  const original = useMemo<SkillNode | null>(
    () => data?.tree.nodes.find((n) => n.id === selectedId) ?? null,
    [data, selectedId],
  );

  if (isPending) return <Loading />;
  if (error || !data || !merged) return <Failed onRetry={() => refetch()} />;

  const { title, missions } = data;
  const tree: Tree = { nodes: named, prereqs: data.tree.prereqs };
  const { masteredIds, xp, completedMissionIds } = merged;

  if (tree.nodes.length === 0) return <EmptyChart title={title} />;

  const level = levelForXp(xp);
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

  const onComplete = async (node: SkillNode) => {
    await complete(node.id);
    setJustCompleted(node.id);
    setSelectedId(null);
    AccessibilityInfo.announceForAccessibility(
      `${node.title} marked complete. ${node.xpReward} XP recorded.`,
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <DitherField flat={prefs.lowBandwidth} />

      <View style={[styles.marginalia, { paddingTop: insets.top + space.cell }]}>
        <View style={styles.courseBlock}>
          <PixelText variant="title" numberOfLines={1}>
            {title}
          </PixelText>
          <PixelText variant="micro" colour={t.ink}>
            {masteredIds.length} of {tree.nodes.length} cleared
          </PixelText>
        </View>

        <View style={styles.readout}>
          <PixelText variant="micro" colour={t.ink}>
            LV {level} · {xp}/{totalXp(tree.nodes)} XP
          </PixelText>
          <Meter
            value={levelProgress(xp)}
            colour={t.earned}
            label={`Level ${level}, ${Math.round(levelProgress(xp) * 100)} percent to the next level`}
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
        tree={tree}
        masteredIds={masteredIds}
        selectedId={selectedId}
        onSelectNode={(n) => {
          setSelectedId(n.id);
          setRenaming(false);
          setConfirmingHelp(false);
          setHelpNote(null);
        }}
        recommendedId={next?.id ?? null}
        recentlyMasteredId={justCompleted}
        reduceMotion={prefs.motionOff}
        lowBandwidth={prefs.lowBandwidth}
        positions={positions}
        onMoveNode={moveNode}
        onResetLayout={resetLayout}
      />
        </View>

      {selected && eligibility ? (
        <Window
          title={selected.title}
          onClose={() => setSelectedId(null)}
          style={wide ? styles.dockWide : styles.dock}
        >
          <View style={styles.rowBetween}>
            <StatusTag status={status} />
            <PixelText variant="micro" colour={t.earnedText}>
              {selected.xpReward} XP
            </PixelText>
          </View>

          {/* Capped on a phone so the window cannot swallow the chart; on a wide
              screen it has its own column and can use the height it has. */}
          <ScrollView style={wide ? styles.sheetScrollWide : styles.sheetScroll}>
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

            <PixelText variant="body" colour={t.ink}>
              {selected.description}
            </PixelText>

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
              <View style={styles.objective}>
                <PixelText variant="micro" colour={t.inkMuted}>
                  WHAT YOU WILL LEARN
                </PixelText>
                <PixelText variant="body" colour={t.ink}>
                  {selected.learningObjective}
                </PixelText>
              </View>
            ) : null}

            {selectedMissions.length > 0 ? (
              <View style={styles.missions}>
                <View style={styles.rowBetween}>
                  <PixelText variant="micro" colour={t.inkMuted}>
                    MISSIONS
                  </PixelText>
                  <PixelText variant="micro" colour={isMastered ? t.earnedText : t.inkMuted}>
                    {nodeXpDone} OF {nodeXpTotal} XP
                  </PixelText>
                </View>

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
                    onPress={() => toggleMission(mission.id, state !== 'done')}
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

                      {mission.description ? (
                        <PixelText variant="micro" colour={t.inkMuted}>
                          {mission.description}
                        </PixelText>
                      ) : null}

                      <PixelText variant="micro" colour={t.inkMuted}>
                        {[mission.kind, mission.estimatedMinutes ? `${mission.estimatedMinutes} MIN` : null]
                          .filter(Boolean)
                          .join(' · ')
                          .toUpperCase()}
                      </PixelText>

                      {/* The row is the checkbox, so this is a readout of its
                          state rather than a second control competing with it. */}
                      {state === 'done' ? (
                        <PixelText variant="micro" colour={t.earnedText}>
                          ✓ MARKED COMPLETE · TAP TO UNDO
                        </PixelText>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

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

            {/* The companion is built to be opened *about* something. Reaching it
                from Settings with no node is the degraded path, so the one place
                the context exists offers it too. Labelled here as well as there,
                because a student should know what it is before they tap. */}
            {status === 'locked' ? null : (
              <Pressable
                onPress={() =>
                  router.navigate({
                    pathname: '/companion',
                    params: { courseId, nodeId: selected.id },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Ask the companion about ${selected.title}. Prototype: its replies are canned.`}
                style={({ pressed }) => [
                  styles.companionRow,
                  bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
                ]}
              >
                <PixelIcon name="play" size={12} colour={t.info} />
                <PixelText variant="body" colour={t.ink} style={styles.requireLabel}>
                  Ask about this
                </PixelText>
                <PixelText variant="micro" colour={t.inkMuted}>
                  PROTOTYPE
                </PixelText>
              </Pressable>
            )}

            {prereqNodes.length > 0 ? (
              <View style={styles.requires}>
                <View style={styles.rowBetween}>
                  <PixelText variant="micro" colour={t.inkMuted}>
                    PREREQUISITES
                  </PixelText>
                  <PixelText variant="micro" colour={t.inkMuted}>
                    {prereqsMastered} OF {prereqNodes.length} MASTERED
                  </PixelText>
                </View>

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
              </View>
            ) : null}
          </ScrollView>

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
      ) : next ? (
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

function Loading() {
  const t = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <DitherField />
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

function Failed({ onRetry }: { onRetry: () => void }) {
  const t = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <DitherField />
      <View style={styles.centred}>
        <Window title="Chart unavailable" style={styles.notice}>
          <PixelText variant="body" colour={t.ink}>
            Couldn&apos;t load this chart. Check your connection and try again.
          </PixelText>
          <PixelButton label="Try again" onPress={onRetry} />
        </Window>
      </View>
    </View>
  );
}

function EmptyChart({ title }: { title: string }) {
  const t = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <DitherField />
      <View style={styles.centred}>
        <Window title={title} style={styles.notice}>
          <PixelText variant="body" colour={t.ink}>
            This course has no nodes yet. Upload its syllabus and a chart gets drawn for you.
          </PixelText>
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingBottom: space.cell,
  },
  courseBlock: { flexShrink: 1, gap: space.hair },
  readout: { alignItems: 'flex-end', gap: space.xs },
  streak: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  fill: { flex: 1 },
  // No `alignItems` here on purpose: the default is `stretch`, and the chart
  // column needs the row's full height. Setting it to `flex-start` collapsed the
  // chart to zero height and rendered an empty canvas.
  wideBody: { flex: 1, flexDirection: 'row' },
  dock: { margin: space.cell },
  // The panel sits in its own column but must not be stretched to the row's
  // height by the `stretch` default above.
  dockWide: { width: DOCK_WIDTH, margin: space.cell, maxHeight: '100%', alignSelf: 'flex-start' },
  nextBarWide: { width: DOCK_WIDTH, alignSelf: 'flex-end' },
  sheetScroll: { maxHeight: 260 },
  sheetScrollWide: { maxHeight: 460 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  naming: { gap: space.xs, marginBottom: space.cell },
  renameToggle: { minHeight: touch, justifyContent: 'center', paddingLeft: space.md },
  renameForm: { gap: space.cell, marginTop: space.xs },
  objective: { marginTop: space.cell, gap: space.hair },
  field: { gap: space.hair },
  grow: { flex: 1 },
  missions: { marginTop: space.md, gap: space.xs },
  help: { marginTop: space.md, padding: space.cell, gap: space.cell },
  missionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    minHeight: touch,
    paddingHorizontal: space.cell,
  },
  missionBox: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionBody: { flex: 1, gap: space.hair },
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
