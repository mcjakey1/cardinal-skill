/**
 * The one node property panel.
 *
 * A student editing a Playground chart and an instructor editing a course chart
 * are doing the same job, so they get the same controls: name, what it covers,
 * kind, icon, XP, scope, and the mission rows whose rewards decide the node's
 * XP. Learning one of these screens has to be enough to use the other.
 *
 * What it does *not* decide is where the edit lands. `onSave` hands back a
 * `NodeEdit` and the surface stores it: the student writes a device-local
 * snapshot, the instructor pushes ops onto the publish draft. That split is
 * deliberate and this component must never reach past it for storage itself.
 *
 * It draws in the student's tokens on both surfaces, for the same reason the
 * canvas does — this is the editing surface, and an instructor needs to see the
 * node as it is delivered while they change it.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, SlideInRight, SlideOutRight } from 'react-native-reanimated';

import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { SubjectPixelIcon } from '@/ui/SubjectPixelIcon';
import { PixelButton, PixelIcon, PixelInput, PixelText, StatusTag, Toggle, bevelStyle } from '@/ui/pixel';

import { missionDraftTotal, type MissionDraft } from './missionEditing';
import type { DisplayStatus } from './nodeVisualState';
import {
  NODE_KINDS,
  mintId,
  nodeEditForm,
  nodeEditProblems,
  nodeEditResult,
  type NodeEdit,
} from './nodeEditing';
import { PIXEL_ICON_KEYS } from './pixelIcons';
import type { Mission, SkillNode } from './types';

export function NodeEditorPanel({
  node,
  missions,
  prereqs,
  status = 'available',
  reduceMotion,
  canSetUniversal = true,
  onUnlink,
  onSave,
  onCancel,
}: {
  node: SkillNode;
  /** This node's missions only. */
  missions: readonly Mission[];
  /** What this node requires, named. Connecting is a canvas gesture; only the
      undo of it needs a control, and this is where the edge is legible. */
  prereqs: readonly { id: string; title: string }[];
  /** Drives the live preview's colours. */
  status?: DisplayStatus;
  reduceMotion?: boolean;
  /**
   * Whether this surface can actually store a universal skill.
   *
   * False for an instructor: `publish_chart_changes` writes every node with
   * `track_id` null (0015:136), because `node_has_one_parent` (0001:92) makes a
   * universal node one that has left the course. A toggle there would take an
   * edit the publish cannot carry, so the scope is shown and not offered.
   */
  canSetUniversal?: boolean;
  /** Drop one prerequisite edge. Local on the student chart, an op on the draft. */
  onUnlink: (prereqId: string) => void;
  onSave: (edit: NodeEdit) => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useTheme();
  const { theme } = useAppTheme();
  const [form, setForm] = useState(() => nodeEditForm(node, missions));

  const problems = nodeEditProblems(form);
  const canSave = !problems.title && !problems.xp;
  const missionTotal = missionDraftTotal(form.missions);
  const usesMissionRewards = form.missions.length > 0;
  const nodeTotal = usesMissionRewards
    ? missionTotal
    : Math.max(0, Number.parseInt(form.xp, 10) || 0);

  const previewTheme = status === 'mastered'
    ? theme.nodeCompleted
    : status === 'locked'
      ? theme.nodeLocked
      : theme.nodeActive;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const setMission = (id: string, patch: Partial<MissionDraft>) =>
    setForm((current) => ({
      ...current,
      missions: current.missions.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));

  const addMission = () =>
    setForm((current) => ({
      ...current,
      missions: [
        ...current.missions,
        {
          // A real uuid, not a local slug: an instructor's mission has to
          // survive publish, and one id rule is fewer than two.
          id: mintId(),
          skillId: node.id,
          title: 'New mission',
          description: '',
          kind: current.kind,
          xpReward: '0',
          estimatedMinutes: 30,
        },
      ],
    }));

  return (
    <Animated.View
      entering={reduceMotion ? undefined : SlideInRight.duration(240).easing(Easing.out(Easing.cubic))}
      exiting={reduceMotion ? undefined : SlideOutRight.duration(200).easing(Easing.in(Easing.cubic))}
      style={styles.form}
    >
      <PixelInput label="Node title" value={form.title} onChangeText={(v) => set('title', v)} />
      {problems.title ? (
        <PixelText variant="micro" colour={t.alarm}>{problems.title}</PixelText>
      ) : null}

      <PixelInput
        label="Topic / description"
        value={form.description}
        onChangeText={(v) => set('description', v)}
        multiline
      />

      <PixelText variant="micro" colour={t.info}>KIND</PixelText>
      <View style={styles.chips}>
        {NODE_KINDS.map((kind) => {
          const active = kind === form.kind;
          return (
            <Pressable
              key={kind}
              onPress={() => set('kind', kind)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={kind}
              style={({ pressed }) => [
                styles.chip,
                bevelStyle(t, active ? 'brand' : 'panel', pressed || active ? 'inset' : 'raised'),
              ]}
            >
              <PixelText variant="micro" colour={active ? t.brandInk : t.inkMuted}>
                {kind.toUpperCase()}
              </PixelText>
            </Pressable>
          );
        })}
      </View>

      {usesMissionRewards ? (
        <Readout label="NODE TOTAL XP" value={`${nodeTotal} XP`} detail="SUM OF MISSION REWARDS" />
      ) : (
        <>
          <PixelInput
            label="Node total XP"
            value={form.xp}
            onChangeText={(v) => set('xp', v)}
            keyboardType="number-pad"
          />
          {problems.xp ? (
            <PixelText variant="micro" colour={t.alarm}>{problems.xp}</PixelText>
          ) : null}
        </>
      )}

      {canSetUniversal ? (
        <Toggle
          value={form.universal}
          onChange={(v) => set('universal', v)}
          label="Universal skill"
        />
      ) : (
        <Readout
          label="SKILL SCOPE"
          value={form.universal ? 'UNIVERSAL SKILL' : 'COURSE SKILL'}
          detail="A PUBLISHED NODE BELONGS TO ITS COURSE"
        />
      )}

      <PixelText variant="micro" colour={t.info}>PIXEL ICON</PixelText>
      <ScrollView horizontal contentContainerStyle={styles.iconChoices} showsHorizontalScrollIndicator={false}>
        {PIXEL_ICON_KEYS.map((icon) => {
          const active = form.iconKey === icon;
          return (
            <Pressable
              key={icon}
              onPress={() => set('iconKey', icon)}
              accessibilityRole="radio"
              accessibilityLabel={icon.replaceAll('_', ' ')}
              accessibilityState={{ checked: active }}
              style={({ pressed }) => [
                styles.iconChoice,
                bevelStyle(t, active ? 'brand' : 'panel', pressed || active ? 'inset' : 'raised'),
              ]}
            >
              <SubjectPixelIcon icon={icon} size={20} colour={active ? t.brandInk : t.inkMuted} />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.livePreview, { backgroundColor: theme.surface, borderColor: previewTheme.border }]}>
        <PixelText variant="micro" colour={theme.nodeCompleted.border}>LIVE PREVIEW</PixelText>
        <View style={styles.previewNodeRow}>
          <View style={[styles.previewNode, { backgroundColor: previewTheme.background, borderColor: previewTheme.border }]}>
            <SubjectPixelIcon icon={form.iconKey} colour={previewTheme.icon} />
          </View>
          <View style={styles.grow}>
            <PixelText variant="label" colour={theme.textPrimary} numberOfLines={2}>
              {form.title.trim() || 'Untitled skill'}
            </PixelText>
            <PixelText variant="micro" colour={theme.textMuted} numberOfLines={2}>
              {form.description.trim() || 'No topic description yet.'}
            </PixelText>
          </View>
        </View>
        <View style={styles.previewMeta}>
          <StatusTag status={status} />
          <PixelText variant="micro" colour={theme.textSecondary}>
            {form.universal ? 'UNIVERSAL SKILL' : 'COURSE SKILL'}
          </PixelText>
          <PixelText variant="micro" colour={theme.nodeCompleted.icon}>{nodeTotal} XP</PixelText>
        </View>
      </View>

      <View style={styles.missionTools}>
        <PixelText variant="micro" colour={t.info}>REQUIRES</PixelText>
        {prereqs.length === 0 ? (
          <PixelText variant="micro" colour={t.inkMuted}>
            NOTHING YET. USE CONNECT ON THE CHART.
          </PixelText>
        ) : (
          prereqs.map((prereq) => (
            <View key={prereq.id} style={[styles.prereqRow, { borderColor: theme.border }]}>
              <PixelText variant="body" colour={t.ink} style={styles.grow} numberOfLines={1}>
                {prereq.title}
              </PixelText>
              <Pressable
                onPress={() => onUnlink(prereq.id)}
                accessibilityRole="button"
                accessibilityLabel={`Disconnect ${prereq.title}`}
                style={({ pressed }) => [
                  styles.missionDelete,
                  bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
                ]}
              >
                <PixelIcon name="close" size={12} colour={t.alarm} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      <View style={styles.missionTools}>
        <View style={styles.rowBetween}>
          <PixelText variant="micro" colour={t.info}>MISSIONS &amp; REWARDS</PixelText>
          <PixelText variant="micro" colour={t.earnedText}>{missionTotal} XP</PixelText>
        </View>
        {form.missions.map((mission) => (
          <View key={mission.id} style={[styles.missionRow, { borderColor: theme.border }]}>
            <View style={styles.missionTitle}>
              <PixelInput
                label="Mission title"
                value={mission.title}
                onChangeText={(title) => setMission(mission.id, { title })}
              />
            </View>
            <View style={styles.missionXp}>
              <PixelInput
                label="XP"
                value={mission.xpReward}
                keyboardType="number-pad"
                onChangeText={(xpReward) => setMission(mission.id, { xpReward })}
              />
            </View>
            <Pressable
              onPress={() =>
                setForm((current) => ({
                  ...current,
                  missions: current.missions.filter((m) => m.id !== mission.id),
                }))
              }
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

      <PixelButton
        label="Save properties"
        disabled={!canSave}
        onPress={() => void onSave(nodeEditResult(form, node))}
      />
      {/* Dropping the hand-typed name is not the same as typing a different one:
          the generated name only comes back when the override is gone. */}
      {node.titleOverride ? (
        <PixelButton
          tone="panel"
          label={node.questTitle ? 'Use the generated name' : 'Use the syllabus title'}
          onPress={() => void onSave({ ...nodeEditResult(form, node), titleOverride: null })}
        />
      ) : null}
      <PixelButton tone="panel" label="Cancel editing" onPress={onCancel} />
    </Animated.View>
  );
}

/** A labelled fact the editor states rather than asks for. */
function Readout({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const t = useTheme();
  return (
    <View style={styles.readout}>
      <PixelText variant="micro" colour={t.inkMuted}>{label}</PixelText>
      <PixelText variant="body" colour={t.ink}>{value}</PixelText>
      {detail ? <PixelText variant="micro" colour={t.inkMuted}>{detail}</PixelText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.cell },
  grow: { flex: 1 },
  readout: { gap: space.hair },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    minHeight: touch,
    paddingHorizontal: space.cell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChoices: { gap: space.xs, paddingVertical: space.xs },
  iconChoice: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  livePreview: { borderWidth: bevel, padding: space.cell, gap: space.cell },
  previewNodeRow: { flexDirection: 'row', alignItems: 'center', gap: space.cell },
  previewNode: {
    width: touch,
    height: touch,
    borderWidth: bevel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.cell },
  missionTools: { gap: space.xs },
  missionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.xs,
    borderWidth: bevel,
    padding: space.xs,
  },
  prereqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: bevel,
    paddingHorizontal: space.xs,
  },
  missionTitle: { minWidth: 0, flex: 1 },
  missionXp: { width: 88 },
  missionDelete: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
});
