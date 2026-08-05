import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_LAYOUT, autoLayout } from '@/features/skilltree/autoLayout';
import type { NodeKind, Prereq, SkillNode } from '@/features/skilltree/types';
import { slugId, validateGraph } from '@/features/skilltree/validation';
import { usePrefs } from '@/lib/prefs';
import { createStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { Window } from '@/ui/Window';
import { Bevel, PixelButton, PixelIcon, PixelInput, PixelText, bevelStyle } from '@/ui/pixel';

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Build a chart by hand, node by node.
 *
 * The parser on `/upload` is the fast path and this is the honest one: an
 * instructor who already knows the shape of their course should not have to
 * write a syllabus for a model to read back. Both paths end at the same three
 * tables.
 *
 * Nothing is published until the graph is valid. `validateGraph` is the loud
 * half of the contract `progression.ts` keeps quiet — the chart tolerates a
 * dangling prerequisite by dropping the edge, which is right for a student and
 * wrong for the person who just typed it.
 */

const KINDS: NodeKind[] = ['topic', 'reading', 'assignment', 'assessment', 'project'];

/** XP the DB will accept is 0–10000; this is the range a node is worth reading. */
const XP_MIN = 1;
const XP_MAX = 2000;

/** `name-quest` names at most this many nodes per request. */
const NAME_BATCH = 40;

interface Draft {
  /** Slug, local to this draft. The database assigns the real uuid on publish. */
  id: string;
  title: string;
  description: string;
  kind: NodeKind;
  xpReward: number;
  prereqIds: string[];
}

interface Saved {
  courseTitle: string;
  drafts: Draft[];
}

const EMPTY: Saved = { courseTitle: '', drafts: [] };

const draftStore = createStore<Saved>(AsyncStorage, 'cardinal.author.v1', 1, EMPTY);

type Line = { text: string; tone: 'info' | 'ok' | 'bad' };

export default function Author() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lowBandwidth } = usePrefs();

  const [courseTitle, setCourseTitle] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [ready, setReady] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<NodeKind>('topic');
  const [xp, setXp] = useState('50');
  const [prereqIds, setPrereqIds] = useState<string[]>([]);

  const [log, setLog] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState<{ courseId: string; nodeIds: string[] } | null>(null);

  const say = (text: string, tone: Line['tone'] = 'info') =>
    setLog((prev) => [...prev, { text: `${String(prev.length).padStart(2, '0')}: ${text}`, tone }]);

  useEffect(() => {
    let live = true;
    draftStore.load().then((saved) => {
      if (!live) return;
      setCourseTitle(saved.courseTitle);
      setDrafts(saved.drafts);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  // Every keystroke is worth keeping: an instructor building a twenty-node chart
  // on a phone will be interrupted, and losing it to a backgrounded app would be
  // the last time they used this screen. Held until the first load lands so the
  // empty initial state cannot overwrite what is stored.
  const firstSave = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    draftStore.save({ courseTitle, drafts }).catch(() => {});
  }, [ready, courseTitle, drafts]);

  const { nodes, prereqs } = useMemo(() => toGraph(drafts), [drafts]);
  const validation = useMemo(() => validateGraph(nodes, prereqs), [nodes, prereqs]);
  const titleOf = useMemo(() => new Map(drafts.map((d) => [d.id, d.title])), [drafts]);

  const totalXp = drafts.reduce((sum, d) => sum + d.xpReward, 0);
  const formReady = title.trim().length > 0;
  const canPublish =
    courseTitle.trim().length > 0 && drafts.length > 0 && validation.isValid && !busy;

  const clearForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setKind('topic');
    setXp('50');
    setPrereqIds([]);
  };

  const saveNode = () => {
    const xpReward = clampXp(xp);
    const trimmed = title.trim();

    if (editingId) {
      // The id is kept through an edit: every prerequisite in the draft points at
      // it, and re-slugging a renamed node would quietly orphan them.
      setDrafts((prev) =>
        prev.map((d) =>
          d.id === editingId
            ? { ...d, title: trimmed, description: description.trim(), kind, xpReward, prereqIds }
            : d,
        ),
      );
    } else {
      const id = slugId(trimmed, new Set(drafts.map((d) => d.id)));
      setDrafts((prev) => [
        ...prev,
        { id, title: trimmed, description: description.trim(), kind, xpReward, prereqIds },
      ]);
    }
    clearForm();
  };

  const editNode = (d: Draft) => {
    setEditingId(d.id);
    setTitle(d.title);
    setDescription(d.description);
    setKind(d.kind);
    setXp(String(d.xpReward));
    setPrereqIds(d.prereqIds);
  };

  const deleteNode = (id: string) => {
    // Cascade: a prerequisite pointing at a deleted node is a validation error
    // the author did not make, so it is cleaned up rather than reported.
    setDrafts((prev) =>
      prev
        .filter((d) => d.id !== id)
        .map((d) => ({ ...d, prereqIds: d.prereqIds.filter((p) => p !== id) })),
    );
    if (editingId === id) clearForm();
  };

  const publish = async () => {
    setBusy(true);
    setLog([]);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        say('PUBLISHING NEEDS A SIGNED-IN ACCOUNT, AND SIGN-IN IS NOT WIRED YET', 'bad');
        say('THE DRAFT IS SAVED ON THIS DEVICE. NOTHING WAS SENT');
        return;
      }

      say('CREATING COURSE');
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({ title: courseTitle.trim(), owner_id: auth.user.id })
        .select('id')
        .single();
      if (courseError || !course) throw courseError ?? new Error('No course returned.');

      say(`PLACING ${nodes.length} NODES`);
      const placed = autoLayout(nodes, prereqs, DEFAULT_LAYOUT).nodes;
      const { data: rows, error: nodeError } = await supabase
        .from('skill_nodes')
        .insert(
          placed.map((n) => ({
            course_id: course.id,
            title: n.title,
            description: n.description,
            kind: n.kind,
            xp_reward: n.xpReward,
            x: n.x,
            y: n.y,
            sort_order: n.sortOrder,
          })),
        )
        .select('id, sort_order');
      if (nodeError) throw nodeError;

      // sort_order is this draft's index, so it is the one field that survives
      // the round trip and can carry a draft id to the uuid the database chose.
      const draftAt = new Map(placed.map((n) => [n.sortOrder, n.id]));
      const uuidFor = new Map<string, string>();
      for (const row of rows ?? []) {
        const draftId = draftAt.get(row.sort_order);
        if (draftId) uuidFor.set(draftId, row.id);
      }
      if (uuidFor.size !== placed.length) {
        throw new Error('The chart came back incomplete. Nothing else was written.');
      }

      if (prereqs.length > 0) {
        say(`LINKING ${prereqs.length} PREREQUISITES`);
        const { error: edgeError } = await supabase.from('node_prereqs').insert(
          prereqs.map((p) => ({
            node_id: uuidFor.get(p.nodeId)!,
            prereq_id: uuidFor.get(p.prereqId)!,
          })),
        );
        if (edgeError) throw edgeError;
      }

      say('CHART DRAWN', 'ok');
      setPublished({ courseId: course.id, nodeIds: [...uuidFor.values()] });
      setDrafts([]);
      setCourseTitle('');
      await draftStore.clear();
    } catch (err) {
      say(String(err instanceof Error ? err.message : err).toUpperCase(), 'bad');
      say('FIX THE ABOVE AND TRY AGAIN');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Ask `name-quest` for quest names. The Edge Function holds the API key and
   * writes with the caller's own token, so the "course owner writes nodes"
   * policy is what decides whether this is allowed.
   */
  const nameQuests = async () => {
    if (!published) return;
    setBusy(true);
    try {
      let named = 0;
      for (let i = 0; i < published.nodeIds.length; i += NAME_BATCH) {
        const batch = published.nodeIds.slice(i, i + NAME_BATCH);
        say(`NAMING ${batch.length} NODES`);
        const { data, error } = await supabase.functions.invoke('name-quest', {
          body: { courseId: published.courseId, nodeIds: batch },
        });
        if (error) throw error;
        named += (data as { named?: number } | null)?.named ?? 0;
      }
      say(`${named} QUESTS NAMED`, 'ok');
    } catch (err) {
      say(String(err instanceof Error ? err.message : err).toUpperCase(), 'bad');
      say('THE CHART IS SAVED. ITS NODES KEEP THEIR SYLLABUS TITLES');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <Head>
        <title>Build a chart · Cardinal Skill</title>
      </Head>
      <DitherField variant="quiet" bands={7} flat={lowBandwidth} />

      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + space.cell }]}>
          <PixelText variant="title">Build a chart by hand</PixelText>
          <PixelText variant="body" colour={t.inkMuted}>
            Add a node for each thing the course teaches, then say which ones have to come first.
            The chart is checked before it goes anywhere.
          </PixelText>

          <PixelInput
            label="Course name"
            value={courseTitle}
            onChangeText={setCourseTitle}
            placeholder="Statistics 101"
          />

          {/* ------------------------------------------------------------ form */}
          <Window title={editingId ? 'Edit node' : 'Add a node'} live={false}>
            <PixelInput
              label="Node name"
              value={title}
              onChangeText={setTitle}
              placeholder="Describing data"
            />
            <PixelInput
              label="What it covers"
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="Mean, median, spread, and when each one misleads."
            />

            <View style={styles.group}>
              <PixelText variant="micro" colour={t.inkMuted}>
                KIND
              </PixelText>
              <View style={styles.chips}>
                {KINDS.map((k) => {
                  const active = k === kind;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setKind(k)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      accessibilityLabel={k}
                      style={({ pressed }) => [
                        styles.chip,
                        bevelStyle(t, active ? 'brand' : 'panel', pressed || active ? 'inset' : 'raised'),
                      ]}
                    >
                      <PixelText variant="micro" colour={active ? t.ink : t.inkMuted}>
                        {k.toUpperCase()}
                      </PixelText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <PixelInput
              label={`XP, ${XP_MIN} to ${XP_MAX}`}
              value={xp}
              onChangeText={setXp}
              keyboardType="number-pad"
              placeholder="50"
            />

            {drafts.filter((d) => d.id !== editingId).length > 0 ? (
              <View style={styles.group}>
                <PixelText variant="micro" colour={t.inkMuted}>
                  COMES AFTER
                </PixelText>
                {drafts
                  .filter((d) => d.id !== editingId)
                  .map((d) => {
                    const on = prereqIds.includes(d.id);
                    return (
                      <Pressable
                        key={d.id}
                        onPress={() =>
                          setPrereqIds((prev) =>
                            on ? prev.filter((p) => p !== d.id) : [...prev, d.id],
                          )
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`Requires ${d.title}`}
                        style={({ pressed }) => [
                          styles.pickRow,
                          bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
                        ]}
                      >
                        <View style={[styles.box, { backgroundColor: t.well }]}>
                          {on ? <PixelIcon name="check" size={14} colour={t.earnedText} /> : null}
                        </View>
                        <PixelText variant="body" colour={t.ink} style={styles.grow}>
                          {d.title}
                        </PixelText>
                      </Pressable>
                    );
                  })}
              </View>
            ) : null}

            <PixelButton
              label={editingId ? 'Save this node' : 'Add this node'}
              disabled={!formReady}
              onPress={saveNode}
            />
            {editingId ? <PixelButton tone="panel" label="Cancel" onPress={clearForm} /> : null}
          </Window>

          {/* ------------------------------------------------------------ list */}
          {drafts.length > 0 ? (
            <View style={styles.group}>
              <View style={styles.rowBetween}>
                <PixelText variant="title">Nodes</PixelText>
                <PixelText variant="micro" colour={t.inkMuted}>
                  {drafts.length} · {totalXp} XP
                </PixelText>
              </View>

              {drafts.map((d) => (
                <Bevel key={d.id} tone="panel" style={styles.nodeRow}>
                  <View style={styles.grow}>
                    <PixelText variant="body" colour={t.ink}>
                      {d.title}
                    </PixelText>
                    <PixelText variant="micro" colour={t.inkMuted}>
                      {d.kind.toUpperCase()} · {d.xpReward} XP
                      {d.prereqIds.length > 0
                        ? ` · AFTER ${d.prereqIds.map((p) => titleOf.get(p) ?? p).join(', ').toUpperCase()}`
                        : ''}
                    </PixelText>
                  </View>
                  <Pressable
                    onPress={() => editNode(d)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${d.title}`}
                    style={styles.rowAction}
                  >
                    <PixelText variant="micro" colour={t.alarm}>
                      EDIT
                    </PixelText>
                  </Pressable>
                  <Pressable
                    onPress={() => deleteNode(d.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${d.title}`}
                    style={styles.rowAction}
                  >
                    <PixelIcon name="close" size={12} colour={t.inkMuted} />
                  </Pressable>
                </Bevel>
              ))}
            </View>
          ) : null}

          {/* ---------------------------------------------------------- review */}
          {drafts.length > 0 && !validation.isValid ? (
            <Window title="Fix these first">
              {validation.errors.map((e, i) => (
                <View key={i} style={styles.errorRow}>
                  <PixelText variant="body" colour={t.alarm}>
                    {e.message}
                  </PixelText>
                  <PixelText variant="micro" colour={t.inkMuted}>
                    {e.nodeIds.map((id) => (titleOf.get(id) ?? id).toUpperCase()).join(' · ')}
                  </PixelText>
                </View>
              ))}
            </Window>
          ) : null}

          {log.length > 0 ? (
            <Window title="Log" live={false}>
              {log.map((line, i) => (
                <PixelText
                  key={i}
                  variant="body"
                  colour={
                    line.tone === 'bad'
                      ? t.alarm
                      : line.tone === 'ok'
                        ? t.earnedText
                        : t.inkMuted
                  }
                >
                  {line.text}
                </PixelText>
              ))}
            </Window>
          ) : null}

          <View style={styles.actions}>
            {published ? (
              <>
                <PixelButton
                  label={busy ? 'Working…' : 'Name the quests'}
                  disabled={busy}
                  onPress={nameQuests}
                />
                <PixelButton
                  tone="earned"
                  label="Open the chart"
                  onPress={() =>
                    router.navigate({
                      pathname: '/tree/[courseId]',
                      params: { courseId: published.courseId },
                    })
                  }
                />
              </>
            ) : (
              <PixelButton
                label={busy ? 'Working…' : 'Publish this chart'}
                disabled={!canPublish}
                onPress={publish}
              />
            )}
            <PixelButton label="Back" tone="panel" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** The draft as the pure helpers want it: nodes and edges, no React. */
function toGraph(drafts: Draft[]): { nodes: SkillNode[]; prereqs: Prereq[] } {
  return {
    nodes: drafts.map((d, i) => ({
      id: d.id,
      courseId: null,
      trackId: null,
      title: d.title,
      description: d.description,
      kind: d.kind,
      xpReward: d.xpReward,
      x: 0,
      y: 0,
      sortOrder: i,
    })),
    prereqs: drafts.flatMap((d) => d.prereqIds.map((prereqId) => ({ nodeId: d.id, prereqId }))),
  };
}

function clampXp(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return XP_MIN;
  return Math.max(XP_MIN, Math.min(XP_MAX, parsed));
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  body: { padding: space.md, gap: space.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  grow: { flex: 1 },
  group: { gap: space.xs },
  rowBetween: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    minHeight: touch,
    paddingHorizontal: space.cell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    minHeight: touch,
    paddingHorizontal: space.cell,
  },
  box: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    minHeight: touch,
    paddingHorizontal: space.cell,
    paddingVertical: space.xs,
  },
  rowAction: {
    minHeight: touch,
    minWidth: touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorRow: { gap: space.hair },
  actions: { gap: space.cell, marginTop: space.cell, paddingBottom: space.xl },
});
