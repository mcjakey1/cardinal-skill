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
 * IT DRAWS IN TWO SKINS, AND THE LINE BETWEEN THEM IS THE ONE `DESIGN.md` DRAWS.
 * That document licenses exactly one crossing between the two design systems:
 * "the authoring canvas, which draws the tree exactly as delivered so an author
 * can see what they ship". The canvas is the artifact. This panel is the tooling
 * around it, and on the instructor surface it wears that workspace's tokens.
 *
 * This was one skin until it was looked at. The pixel inks — `t.ink`,
 * `t.inkMuted` — are calibrated against the dark panel ground they were drawn
 * for, and the instructor workspace is a light one, so `Readout` in particular
 * put grey-on-cream at a ratio nobody could read. Every control kept its own
 * dark ground and stayed legible, which is why the failure looked arbitrary.
 *
 * The live preview is the exception inside the exception: it keeps the student's
 * tokens on both surfaces, because it is the node as delivered. That is the
 * crossing `DESIGN.md` names, and it is the only thing here that gets it.
 *
 * Two skins, one tree. Everything below is written once and reads `kit`, so the
 * surfaces cannot drift into two panels with different behaviour — which is the
 * thing this file exists to prevent.
 */

import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, SlideInRight, SlideOutRight } from 'react-native-reanimated';

import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { SubjectPixelIcon } from '@/ui/SubjectPixelIcon';
import { PixelButton, PixelIcon, PixelInput, PixelText, StatusTag, Toggle, bevelStyle } from '@/ui/pixel';
import { Field, Icon, LButton, LText } from '@/ui/lms';
import { lms } from '@/theme/lms';

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
  surface = 'student',
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
  /**
   * Which design system the tooling wears. The student chart is 'student'; the
   * instructor workspace is 'workspace'. It changes the skin and nothing else —
   * same fields, same rules, same `onSave` payload, because learning one of
   * these screens still has to be enough to use the other.
   */
  surface?: NodeEditorSurface;
  /** Drop one prerequisite edge. Local on the student chart, an op on the draft. */
  onUnlink: (prereqId: string) => void;
  onSave: (edit: NodeEdit) => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useTheme();
  const { theme } = useAppTheme();
  const kit = surface === 'workspace' ? workspaceKit(t) : studentKit(t);
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
      <kit.Input label="Node title" value={form.title} onChangeText={(v) => set('title', v)} />
      {problems.title ? <kit.Problem>{problems.title}</kit.Problem> : null}

      <kit.Input
        label="Topic / description"
        value={form.description}
        onChangeText={(v) => set('description', v)}
        multiline
      />

      <kit.Caption>Kind</kit.Caption>
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
              style={({ pressed }) => [styles.chip, kit.choice(active, pressed)]}
            >
              <kit.ChoiceText active={active}>
                {surface === 'workspace' ? kindLabel(kind) : kind.toUpperCase()}
              </kit.ChoiceText>
            </Pressable>
          );
        })}
      </View>

      {usesMissionRewards ? (
        <Readout
          kit={kit}
          label="Node total XP"
          value={`${nodeTotal} XP`}
          detail="Sum of mission rewards"
        />
      ) : (
        <>
          <kit.Input
            label="Node total XP"
            value={form.xp}
            onChangeText={(v) => set('xp', v)}
            numeric
          />
          {problems.xp ? <kit.Problem>{problems.xp}</kit.Problem> : null}
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
          kit={kit}
          label="Skill scope"
          value={form.universal ? 'Universal skill' : 'Course skill'}
          detail="A published node belongs to its course."
        />
      )}

      <kit.Caption>Pixel icon</kit.Caption>
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
              style={({ pressed }) => [styles.iconChoice, kit.choice(active, pressed)]}
            >
              <SubjectPixelIcon icon={icon} size={20} colour={kit.choiceInk(active)} />
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
        <kit.Caption>Requires</kit.Caption>
        {prereqs.length === 0 ? (
          <kit.Note>Nothing yet. Use connect on the chart.</kit.Note>
        ) : (
          prereqs.map((prereq) => (
            <View key={prereq.id} style={[styles.prereqRow, { borderColor: kit.rowBorder }]}>
              <View style={styles.grow}>
                <kit.Value>{prereq.title}</kit.Value>
              </View>
              <kit.Remove
                label={`Disconnect ${prereq.title}`}
                onPress={() => onUnlink(prereq.id)}
              />
            </View>
          ))
        )}
      </View>

      <View style={styles.missionTools}>
        <View style={styles.rowBetween}>
          <kit.Caption>Missions &amp; rewards</kit.Caption>
          <kit.Total>{missionTotal} XP</kit.Total>
        </View>
        {form.missions.map((mission) => (
          <View key={mission.id} style={[styles.missionRow, { borderColor: kit.rowBorder }]}>
            <View style={styles.missionTitle}>
              <kit.Input
                label="Mission title"
                value={mission.title}
                onChangeText={(title) => setMission(mission.id, { title })}
              />
            </View>
            <View style={styles.missionXp}>
              <kit.Input
                label="XP"
                value={mission.xpReward}
                numeric
                onChangeText={(xpReward) => setMission(mission.id, { xpReward })}
              />
            </View>
            <kit.Remove
              label={`Delete ${mission.title}`}
              onPress={() =>
                setForm((current) => ({
                  ...current,
                  missions: current.missions.filter((m) => m.id !== mission.id),
                }))
              }
            />
          </View>
        ))}
        <kit.Button label="Add mission" onPress={addMission} />
      </View>

      <kit.Button
        label="Save properties"
        primary
        disabled={!canSave}
        onPress={() => void onSave(nodeEditResult(form, node))}
      />
      {/* Dropping the hand-typed name is not the same as typing a different one:
          the generated name only comes back when the override is gone. */}
      {node.titleOverride ? (
        <kit.Button
          label={node.questTitle ? 'Use the generated name' : 'Use the syllabus title'}
          disabled={!canSave}
          onPress={() => void onSave({ ...nodeEditResult(form, node), titleOverride: null })}
        />
      ) : null}
      <kit.Button label="Cancel editing" onPress={onCancel} />
    </Animated.View>
  );
}

/** Sentence case for the workspace, which does not shout its controls. */
function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase();
}

/** A labelled fact the editor states rather than asks for. */
function Readout({
  kit,
  label,
  value,
  detail,
}: {
  kit: Kit;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <View style={styles.readout}>
      <kit.ReadoutLabel>{label}</kit.ReadoutLabel>
      <kit.Value>{value}</kit.Value>
      {detail ? <kit.Note>{detail}</kit.Note> : null}
    </View>
  );
}

// ------------------------------------------------------------------- the skins

export type NodeEditorSurface = 'student' | 'workspace';

type PixelTheme = ReturnType<typeof useTheme>;

/**
 * The parts that differ between the two surfaces, and nothing else.
 *
 * Deliberately small. Anything that can be written once for both — every field,
 * every rule, every handler — is written once above and is not in here. What is
 * in here is colour, typeface and control chrome: the things `DESIGN.md` says
 * must not blend.
 */
interface Kit {
  /** A label above a value. Never the value itself. */
  Caption: (p: { children: ReactNode }) => ReactNode;
  /** A fact the panel states. */
  Value: (p: { children: ReactNode }) => ReactNode;
  /**
   * A sentence, not a label. Kept apart from `Caption` because the workspace's
   * micro token is uppercased with letter spacing — right for "SKILL SCOPE" and
   * wrong for a sentence, which it turns into shouting.
   */
  Note: (p: { children: ReactNode }) => ReactNode;
  /** The word inside a KIND or icon choice. */
  ChoiceText: (p: { active: boolean; children: ReactNode }) => ReactNode;
  /**
   * The label over a stated fact. Quieter than `Caption` on the student
   * surface, where a section heading is cyan and a readout's label was always
   * muted grey — keeping them apart is what stops this refactor from restyling
   * the student chart, which nobody asked for.
   */
  ReadoutLabel: (p: { children: ReactNode }) => ReactNode;
  /** Something is wrong with what was typed. */
  Problem: (p: { children: ReactNode }) => ReactNode;
  /** A running total, called out. */
  Total: (p: { children: ReactNode }) => ReactNode;
  Input: (p: {
    label: string;
    value: string;
    onChangeText: (v: string) => void;
    multiline?: boolean;
    numeric?: boolean;
  }) => ReactNode;
  Button: (p: {
    label: string;
    onPress: () => void;
    primary?: boolean;
    disabled?: boolean;
  }) => ReactNode;
  /** The KIND and icon choosers. */
  choice: (active: boolean, pressed: boolean) => StyleProp<ViewStyle>;
  choiceInk: (active: boolean) => string;
  /** Prerequisite and mission rows. */
  rowBorder: string;
  Remove: (p: { label: string; onPress: () => void }) => ReactNode;
}

function studentKit(t: PixelTheme): Kit {
  return {
    Caption: ({ children }) => <PixelText variant="micro" colour={t.info}>{children}</PixelText>,
    Value: ({ children }) => <PixelText variant="body" colour={t.ink}>{children}</PixelText>,
    Note: ({ children }) => <PixelText variant="micro" colour={t.inkMuted}>{children}</PixelText>,
    ChoiceText: ({ active, children }) => (
      <PixelText variant="micro" colour={active ? t.brandInk : t.inkMuted}>{children}</PixelText>
    ),
    ReadoutLabel: ({ children }) => (
      <PixelText variant="micro" colour={t.inkMuted}>{children}</PixelText>
    ),
    Problem: ({ children }) => <PixelText variant="micro" colour={t.alarm}>{children}</PixelText>,
    Total: ({ children }) => <PixelText variant="micro" colour={t.earnedText}>{children}</PixelText>,
    Input: ({ label, value, onChangeText, multiline, numeric }) => (
      <PixelInput
        label={label}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={numeric ? 'number-pad' : undefined}
      />
    ),
    Button: ({ label, onPress, primary, disabled }) => (
      <PixelButton
        label={label}
        tone={primary ? undefined : 'panel'}
        disabled={disabled}
        onPress={onPress}
      />
    ),
    choice: (active, pressed) => bevelStyle(t, active ? 'brand' : 'panel', pressed || active ? 'inset' : 'raised'),
    choiceInk: (active) => (active ? t.brandInk : t.inkMuted),
    rowBorder: t.line,
    Remove: ({ label, onPress }) => (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.missionDelete, bevelStyle(t, 'panel', pressed ? 'inset' : 'raised')]}
      >
        <PixelIcon name="close" size={12} colour={t.alarm} />
      </Pressable>
    ),
  };
}

/**
 * The instructor's skin. `lms.type.micro` is already uppercase with the letter
 * spacing the brief sets, so a caption needs no styling of its own — which is
 * the check that this is the workspace's own grammar and not the pixel one
 * repainted.
 */
function workspaceKit(_t: PixelTheme): Kit {
  const c = lms.colour;
  return {
    Caption: ({ children }) => <LText variant="micro" tone="muted">{children}</LText>,
    Value: ({ children }) => <LText variant="small" style={styles.workspaceValue}>{children}</LText>,
    Note: ({ children }) => <LText variant="small" tone="muted">{children}</LText>,
    ChoiceText: ({ active, children }) => (
      <LText variant="small" tone={active ? 'brand' : 'muted'} style={styles.workspaceChoiceText}>
        {children}
      </LText>
    ),
    ReadoutLabel: ({ children }) => <LText variant="micro" tone="muted">{children}</LText>,
    Problem: ({ children }) => <LText variant="small" tone="attention">{children}</LText>,
    Total: ({ children }) => <LText variant="micro" tone="brand">{children}</LText>,
    Input: ({ label, value, onChangeText, multiline, numeric }) => (
      <Field
        label={label}
        value={value}
        onChangeText={onChangeText}
        tall={multiline}
        keyboardType={numeric ? 'number-pad' : undefined}
        style={styles.workspaceInput}
      />
    ),
    Button: ({ label, onPress, primary, disabled }) => (
      <LButton
        label={label}
        variant={primary ? 'primary' : 'default'}
        disabled={disabled}
        onPress={onPress}
        style={styles.workspaceButton}
      />
    ),
    choice: (active, pressed) => [
      styles.workspaceChoice,
      {
        backgroundColor: active ? c.brandWash : pressed ? c.surfaceHover : c.surface,
        borderColor: active ? c.brand : c.line,
      },
    ],
    choiceInk: (active) => (active ? c.brand : c.inkMuted),
    rowBorder: c.line,
    Remove: ({ label, onPress }) => (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.missionDelete,
          styles.workspaceChoice,
          { backgroundColor: pressed ? c.surfaceHover : c.surface, borderColor: c.line },
        ]}
      >
        <Icon name="x" size={14} tone="attention" />
      </Pressable>
    ),
  };
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

  // The workspace skin. Hairlines and 5px controls, per `src/theme/lms.ts`.
  workspaceChoice: { borderWidth: 1, borderRadius: lms.radius.sm },
  workspaceChoiceText: { fontWeight: '600' },
  workspaceValue: { fontWeight: '600' },
  workspaceInput: { minHeight: lms.touch },
  workspaceButton: { minHeight: lms.touch, justifyContent: 'center' },
});
