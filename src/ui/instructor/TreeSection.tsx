import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';

import { SkillTree } from '@/features/skilltree/SkillTree';
import { NodeEditorPanel } from '@/features/skilltree/NodeEditorPanel';
import {
  linkRefusal,
  mintId,
  missionsEqual,
  type NodeEdit,
} from '@/features/skilltree/nodeEditing';
import { DEMO_COURSE_ID } from '@/features/skilltree/demoTree';
import { fetchTree } from '@/features/skilltree/queries';
import { resolveQuestName } from '@/features/skilltree/naming';
import { validateGraph } from '@/features/skilltree/validation';
import { countChanges, diffCharts } from '@/features/skilltree/chartDiff';
import { fetchInstructorVerification, publishOfficialCourse } from '@/features/skilltree/courseCatalog';
import { hasDestructiveChanges, summariseImpact, type ArchiveImpact } from '@/features/skilltree/chartImpact';
import { fetchArchiveImpact, publishChart } from '@/features/skilltree/publishChart';
import { purgeCourseCache } from '@/lib/editedTree';
import type { SkillNode, Tree } from '@/features/skilltree/types';
import type { ChartState } from '@/features/skilltree/chartDraft';
import { aliveSubgraph, sameNodeIds } from '@/features/skilltree/chartDraft';
import { unmoved, useChartDraft } from '@/lib/useChartDraft';
import { KEYBOARD_BEHAVIOR } from '@/ui/keyboard';
import { DitherField } from '@/ui/Dither';
import {
  Badge,
  LButton,
  LModal,
  LText,
  Notice,
  Skeleton,
} from '@/ui/lms';
import { styles, type CourseRow } from './shared';

export function TreeSection({
  course,
  canEdit,
  wide,
  flat,
  motionOff,
  onImport,
  onStudentView,
}: {
  course: CourseRow;
  canEdit: boolean;
  wide: boolean;
  flat: boolean;
  motionOff: boolean;
  onImport: () => void;
  onStudentView: () => void;
}) {
  const [selected, setSelected] = useState<SkillNode | null>(null);
  // Which node's form is open, rather than a bare flag: a different node means a
  // fresh form, and adding a node can open its form in the same turn it selects
  // it without an effect racing to close it again.
  const [editingId, setEditingId] = useState<string | null>(null);

  // `modalCard` has no maxHeight and the backdrop centres it, so a card taller
  // than the viewport hangs off both ends with nothing to scroll. On a landscape
  // phone that puts Save out of reach — the exact failure the sheet exists to
  // avoid. Bound it here rather than in `lms.tsx`, which is not ours to change.
  const { height } = useWindowDimensions();
  const modalScroll = useMemo(() => ({ maxHeight: Math.round(height * 0.7) }), [height]);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['instructor-tree', course.id],
    queryFn: () => fetchTree(course.id),
  });

  const queryClient = useQueryClient();
  const verification = useQuery({
    queryKey: ['instructor-verification'],
    queryFn: fetchInstructorVerification,
    enabled: canEdit && course.id !== DEMO_COURSE_ID,
  });
  const { draft, ready, edit, undoEdit, redoEdit, reset, reseed, markPublished, canUndo, canRedo } =
    useChartDraft(canEdit ? course.id : undefined);

  // Seed once per course, and only from a fresh read. A draft already holding
  // edits must survive a refetch, or a background refresh silently discards
  // work in progress.
  //
  // State rather than a ref because the toolbar gates on it: a draft that loads
  // from storage with ops already on it seeds without changing any other state,
  // and a ref would leave the tray hidden with nothing left to trigger a
  // re-render.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!canEdit || !data || !ready) return;
    if (seededFor === course.id) return;
    setSeededFor(course.id);
    // Unconditional, because `reseed` carries `published` across. Gating this on
    // `!draft.published` to save the undo baseline pinned the draft to a
    // baseline it could never leave: `published` is persisted and nothing else
    // clears it, so after one publish every later server-side change — another
    // instructor, a re-parse, a student's help subtree — came back as this
    // instructor's own unpublished edits, and server missions missing from the
    // pinned draft landed in `deleteMissions`.
    if (draft.ops.length === 0) {
      reseed({ nodes: data.tree.nodes, prereqs: data.tree.prereqs, missions: data.missions });
    }
  }, [canEdit, course.id, data, draft.ops.length, ready, reseed, seededFor]);

  /**
   * Whether the draft on screen is this course's, loaded and seeded.
   *
   * `useChartDraft` starts at an empty draft while `data` arrives instantly from
   * the react-query cache, so without this the toolbar flashes "N unpublished"
   * on every remount — N counting every mission and edge, because the diff is
   * against an empty chart — with Publish live and a confirm dialog offering to
   * delete every mission. `movedUnderneath` refuses the write, but it must
   * never be offered.
   */
  const draftReady = canEdit && ready && seededFor === course.id;

  const [editMode, setEditMode] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  // `selected` is a snapshot from the moment of the click, so everything below
  // re-derives the node instead of reading it.
  //
  // In edit mode that means the draft first: it is what the canvas draws, so
  // reading the server row here would show pre-edit values for a node that has
  // already been changed, record the wrong `before` on a second edit to the
  // same node, and leave a just-added node with no inspector at all. Outside
  // edit mode the server row is the truth, and it stays the fallback for a node
  // the draft has not got.
  const live =
    (editMode && canEdit ? draft.working.nodes.find((n) => n.id === selected?.id) : undefined)
    ?? data?.tree.nodes.find((n) => n.id === selected?.id)
    ?? null;

  // A different node means a fresh form, never the previous node's half-typed one.
  const editing = editingId !== null && editingId === selected?.id;

  // `SkillTree` draws `node.title` verbatim, so the caller is the one that
  // decides which name a reader sees — the student screen resolves before
  // handing the tree over, and this canvas has to do the same. Skipping it left
  // a renamed node reading "New node" on the one surface whose whole promise is
  // that it shows the chart as a student receives it.
  const named = useCallback(
    (tree: Tree): Tree => ({
      ...tree,
      nodes: tree.nodes.map((n) => ({ ...n, title: resolveQuestName(n).text })),
    }),
    [],
  );

  // In edit mode the canvas draws the draft, so an unpublished change shows
  // where it was made. Archived nodes are already gone as far as a student goes.
  const shown = useMemo(() => named(aliveSubgraph(draft.working)), [draft.working, named]);

  // The server returns retired nodes to the owner and hides them from students
  // by RLS, so the read-only canvas has to filter them the same way edit mode
  // does. Without this the owner is the one person shown a chart that is not
  // the chart, which is the opposite of what this canvas is for.
  const liveShown = useMemo(() => (data ? named(aliveSubgraph(data.tree)) : null), [data, named]);

  const notice = (text: string) => {
    setLinkNotice(text);
    setTimeout(() => setLinkNotice(null), 2400);
  };

  const addNode = (at: { x: number; y: number }) => {
    const node: SkillNode = {
      id: mintId(),
      courseId: course.id,
      trackId: null,
      title: 'New node',
      description: '',
      kind: 'topic',
      xpReward: 50,
      x: at.x,
      y: at.y,
      sortOrder: draft.working.nodes.length,
    };
    edit({ t: 'add', node });
    setSelected(node);
    // Opened for naming straight away, same as the student chart: a node called
    // "New node" is the one thing nobody meant to add.
    setEditingId(node.id);
  };

  const startLink = () => {
    if (!selected) {
      notice('Select a source node first');
      return;
    }
    setLinkSourceId(selected.id);
    setLinkMode(true);
  };

  const cancelLink = () => {
    setLinkMode(false);
    setLinkSourceId(null);
  };

  const selectNode = (node: SkillNode) => {
    if (!linkMode || !linkSourceId) {
      setSelected(node);
      return;
    }
    // Same basis as the publish gate, or the two disagree about which chart is
    // being checked and a link can pass here only to block Publish later.
    const alive = aliveSubgraph(draft.working);
    const refusal = linkRefusal(alive.nodes, alive.prereqs, linkSourceId, node.id);
    if (refusal) {
      // Link mode stays on, same as the student chart: the source is still the
      // one they picked, and the fix is usually a different target.
      notice(refusal);
      return;
    }
    edit({ t: 'link', nodeId: node.id, prereqId: linkSourceId });
    cancelLink();
  };

  const archiveSelected = () => {
    if (!selected) return;
    edit({ t: 'archive', nodeId: selected.id });
    setSelected(null);
  };

  const moveNode = (nodeId: string, at: { x: number; y: number }) => {
    const before = draft.working.nodes.find((n) => n.id === nodeId);
    if (!before) return;
    edit({ t: 'move', nodeId, before: { x: before.x, y: before.y }, after: at });
  };

  const liveState = useMemo(
    () => ({
      nodes: data?.tree.nodes ?? [],
      prereqs: data?.tree.prereqs ?? [],
      missions: data?.missions ?? [],
    }),
    [data],
  );
  // Against the baseline, never against `liveState`. The query has no staleTime
  // and refetches on window focus, while the seed effect deliberately does not
  // re-seed once this course is seeded — so with ops pending, tabbing away and
  // back moves `liveState` past `draft.baseline` while `working` still holds
  // seed-time values. Diffing against it would turn every field, mission and
  // edge a colleague changed in between into one of ours and revert it on
  // publish, as well as inflating the count with edits nobody here made.
  // `liveState` stays for `summariseImpact`, which only wants titles.
  const changes = useMemo(
    () => diffCharts(draft.baseline, draft.working),
    [draft.baseline, draft.working],
  );
  const validation = useMemo(() => {
    const alive = aliveSubgraph(draft.working);
    return validateGraph(alive.nodes, alive.prereqs);
  }, [draft.working]);

  const [confirming, setConfirming] = useState(false);
  const [impact, setImpact] = useState<ArchiveImpact[]>([]);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [catalogConfirming, setCatalogConfirming] = useState(false);
  const [catalogPublishing, setCatalogPublishing] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const doPublishOfficial = async () => {
    setCatalogPublishing(true);
    setCatalogError(null);
    try {
      await publishOfficialCourse(course.id);
      setCatalogConfirming(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['instructor-courses'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['course-catalog', 'official'] }),
      ]);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'The course was not published to the catalog.');
    } finally {
      setCatalogPublishing(false);
    }
  };

  const openConfirm = async () => {
    setPublishError(null);
    setImpact([]);
    // Open first. Waiting on the round trip before showing anything makes
    // Publish look dead; the counts fill into the dialog once they land.
    setConfirming(true);
    try {
      const rows = await fetchArchiveImpact(course.id, changes.archiveNodes);
      setImpact(summariseImpact(changes, liveState, rows));
    } catch (err) {
      // Leave `impact` empty rather than summarising against no rows: that
      // would print a confident "0 students cleared it" we cannot stand behind.
      setPublishError(
        `The impact counts could not be read${
          err instanceof Error ? `: ${err.message.replace(/\.$/, '')}` : ''
        }. Retiring still works, but this dialog cannot say what it costs.`,
      );
    }
  };

  const doPublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      // Re-read before writing. Another instructor, or a syllabus re-parse, may
      // have moved the chart since this draft started; publishing over that
      // silently would be last-write-wins on someone else's work.
      const fresh = await fetchTree(course.id);
      const freshState: ChartState = {
        nodes: fresh.tree.nodes,
        prereqs: fresh.tree.prereqs,
        missions: fresh.missions,
      };
      if (!sameNodeIds(freshState, draft.baseline)) {
        setPublishError('This chart changed since you started editing. Reload before publishing.');
        return;
      }

      const before = draft.baseline;
      await publishChart(course.id, changes);
      await purgeCourseCache(course.id);
      const after = await fetchTree(course.id);
      markPublished(before, {
        nodes: after.tree.nodes,
        prereqs: after.tree.prereqs,
        missions: after.missions,
      });
      setConfirming(false);
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['instructor-cohort', course.id] }),
        queryClient.invalidateQueries({ queryKey: ['instructor-roster', course.id] }),
        queryClient.invalidateQueries({ queryKey: ['instructor-courses'] }),
      ]);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'The publish did not go through.');
    } finally {
      setPublishing(false);
    }
  };

  /**
   * A publish is reversible because almost nothing it does is destructive:
   * archiving is a flag, node uuids are stable, and edges are re-insertable. The
   * inverse of a change set is the diff taken the other way round.
   *
   * Two honest limits. `diffCharts` only walks the target's nodes, so a node the
   * publish *added* is simply not mentioned by the inverse — it stays live and
   * unarchived rather than being retired, and the undo lands on the previous
   * chart plus that node. And missions are the one thing publish can genuinely
   * destroy, so an inverse that deletes any is refused below rather than run.
   */
  const undoPublish = async () => {
    if (!draft.published) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const current = await fetchTree(course.id);
      const before: ChartState = {
        nodes: current.tree.nodes,
        prereqs: current.tree.prereqs,
        missions: current.missions,
      };
      // The mount-time withdrawal cannot see a colleague who publishes while
      // this instructor stays on the section, and this button reverts the whole
      // chart rather than a targeted diff. Re-check against the read just taken,
      // on the same predicate, so the two cannot disagree. A draft with no
      // `publishedAt` cannot be verified at all, which is equally a refusal.
      if (!draft.publishedAt || !unmoved(draft.publishedAt, before)) {
        setPublishError(
          'This chart has changed since you published, so undoing it would revert someone else’s work too. Nothing has been undone. Reload to see where the chart stands.',
        );
        return;
      }

      const inverse = diffCharts(before, draft.published);
      // `mission_progress.mission_id` cascades, so this would take every
      // student's record of finishing them — and unlike the publish path there
      // is no confirm step in front of this button. Refuse and say why.
      if (inverse.deleteMissions.length > 0) {
        setPublishError(
          `Undoing this would delete ${inverse.deleteMissions.length} mission${
            inverse.deleteMissions.length === 1 ? '' : 's'
          } and every student's record of completing them. Undo cannot do that. Retire the node instead, which keeps the records.`,
        );
        return;
      }
      await publishChart(course.id, inverse);
      await purgeCourseCache(course.id);
      const after = await fetchTree(course.id);
      // One-shot on purpose. The chart is back where it was, so there is
      // nothing left to undo: `reset` re-seeds from the fresh read and clears
      // the baseline, so the button goes away instead of becoming a redo
      // wearing an Undo label.
      reset({ nodes: after.tree.nodes, prereqs: after.tree.prereqs, missions: after.missions });
      await refetch();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'The undo did not go through.');
    } finally {
      setPublishing(false);
    }
  };

  // Same graph `live` came from, or the editor would price a node against
  // missions the canvas is not drawing.
  const ownMissions = useMemo(
    () =>
      (editMode && canEdit ? draft.working.missions : data?.missions ?? []).filter(
        (m) => m.skillId === live?.id,
      ),
    [canEdit, data?.missions, draft.working.missions, editMode, live?.id],
  );

  // Same graph again, so an edge added in the draft is listed where it was made
  // rather than only drawn on the canvas.
  const ownPrereqs = useMemo(() => {
    const state = editMode && canEdit
      ? draft.working
      : { nodes: data?.tree.nodes ?? [], prereqs: data?.tree.prereqs ?? [] };
    return state.prereqs
      .filter((p) => p.nodeId === live?.id)
      .map((p) => ({
        id: p.prereqId,
        title: state.nodes.find((n) => n.id === p.prereqId)?.title ?? p.prereqId,
      }));
  }, [canEdit, data?.tree.nodes, data?.tree.prereqs, draft.working, editMode, live?.id]);

  /**
   * Editing is offered only from inside edit mode.
   *
   * `live` prefers the draft row only when `editMode` is on; outside it the
   * inspector reads the server row, because that is what the canvas is drawing.
   * Offering Edit there let a `field` op record a `before` the draft never held
   * — rename in edit mode, leave it, rename again, and undo restores a state
   * that never existed. Publishing is unaffected either way, since the diff is
   * state-based, but the undo stack is not.
   */
  const canEditNode = editMode && canEdit;

  /**
   * The shared editor's half of the persistence contract, instructor side.
   *
   * The same `NodeEdit` the student screen writes straight to the device lands
   * here as ops on the publish draft, so nothing reaches a student until
   * Publish. Two ops rather than one because they undo separately, and an
   * instructor who only renamed a node should not have their missions on the
   * same undo step.
   */
  const saveNodeEdit = (next: NodeEdit) => {
    if (!live) return;
    edit({
      t: 'field',
      nodeId: live.id,
      before: {
        titleOverride: live.titleOverride ?? null,
        description: live.description,
        kind: live.kind,
        xpReward: live.xpReward,
        iconKey: live.iconKey ?? null,
      },
      after: {
        titleOverride: next.titleOverride,
        description: next.description,
        kind: next.kind,
        iconKey: next.iconKey,
        // Omitted entirely when missions own it, so the change set never claims
        // an XP edit the publish will not make — it recomputes the sum (0015:252).
        ...(next.missions.length > 0 ? {} : { xpReward: next.xpReward }),
      },
    });
    if (!missionsEqual(ownMissions, next.missions)) {
      edit({ t: 'mission', nodeId: live.id, before: ownMissions, after: next.missions });
    }
    setEditingId(null);
  };

  const unlinkPrereq = (prereqId: string) => {
    if (!live) return;
    edit({ t: 'unlink', nodeId: live.id, prereqId });
  };

  const inspectorBody = editing && live && canEditNode ? (
    <NodeEditorPanel
      key={live.id}
      node={live}
      missions={ownMissions}
      prereqs={ownPrereqs}
      onUnlink={unlinkPrereq}
      reduceMotion={motionOff}
      // `publish_chart_changes` writes every node with `track_id` null
      // (0015:136), so an instructor cannot make one universal from here.
      canSetUniversal={false}
      // The inspector is workspace tooling, not the artifact. DESIGN.md scopes
      // the student grammar crossing to the canvas itself; the live preview
      // inside the panel still honours it.
      surface="workspace"
      onSave={saveNodeEdit}
      onCancel={() => setEditingId(null)}
    />
  ) : (
    <NodeInspector
      node={live}
      prereqCount={ownPrereqs.length}
      canEdit={canEditNode}
      onStartEdit={() => setEditingId(live?.id ?? null)}
    />
  );

  return (
    <>
      <View style={[styles.canvasLayout, wide ? styles.canvasLayoutWide : null]}>
      <View style={styles.canvasColumn}>
        <View style={styles.toolbar}>
          <LText variant="small" style={styles.strong} numberOfLines={1}>
            {data?.title ?? course.title}
          </LText>
          <View style={styles.spacer} />
          {/* `|| canRedo` because undoing the last op takes the count to zero,
              and without it the whole tray vanishes mid-gesture and strands the
              redo. The badge and Publish still track real changes. */}
          {draftReady && (countChanges(changes) > 0 || canRedo) ? (
            <>
              {countChanges(changes) > 0 ? (
                <Badge label={`${countChanges(changes)} unpublished`} tone="gold" />
              ) : null}
              <LButton label="Undo" icon="rotate-ccw" size="sm" disabled={!canUndo} onPress={undoEdit} />
              <LButton label="Redo" icon="rotate-cw" size="sm" disabled={!canRedo} onPress={redoEdit} />
              {countChanges(changes) > 0 ? (
                <LButton
                  label="Publish"
                  variant="primary"
                  size="sm"
                  disabled={!validation.isValid}
                  onPress={openConfirm}
                />
              ) : null}
              {/* A greyed-out Publish with no reason beside it is the author
                  staring at their own work wondering what they did wrong.
                  `validateGraph` has already written the sentence — the first
                  one, because fixing it usually clears the rest. */}
              {countChanges(changes) > 0 && !validation.isValid && validation.errors[0] ? (
                <LText variant="small" tone="attention" style={styles.publishBlocked}>
                  {validation.errors[0].message}
                </LText>
              ) : null}
            </>
          ) : null}
          {/* Only with nothing unpublished pending: an undo on top of a
              half-made new draft would publish both at once. */}
          {draftReady && draft.published && countChanges(changes) === 0 ? (
            <LButton
              label={publishing ? 'Undoing…' : 'Undo publish'}
              icon="rotate-ccw"
              size="sm"
              disabled={publishing}
              onPress={undoPublish}
            />
          ) : null}
          {canEdit && course.id !== DEMO_COURSE_ID ? (
            course.kind === 'official' && course.publicationStatus === 'published' ? (
              <Badge label="Official catalog" tone="ok" />
            ) : (
              <LButton
                label="Publish to official catalog"
                icon="globe"
                size="sm"
                disabled={verification.isPending}
                onPress={() => {
                  setCatalogError(null);
                  setCatalogConfirming(true);
                }}
              />
            )
          ) : null}
          {/* Edits the chart already on screen. It used to leave for a separate
              node-row form that created a second, unrelated course, which is
              the one thing "edit this course" must never do. */}
          {canEdit && !editMode ? (
            <LButton
              label="Edit by hand"
              icon="edit-3"
              size="sm"
              onPress={() => setEditMode(true)}
            />
          ) : null}
          <LButton
            label="Open as a student"
            icon="external-link"
            size="sm"
            onPress={onStudentView}
          />
        </View>

        {/* The confirm dialog owns this error while it is open. Undo publish
            runs straight from the toolbar with no dialog, so without this strip
            a failed undo looks like a button that did nothing. */}
        {publishError && !confirming ? (
          <View style={styles.canvasMessage}>
            <Notice tone="error" title="Not published">
              {publishError}
            </Notice>
            <View style={styles.rowWrap}>
              <LButton label="Dismiss" onPress={() => setPublishError(null)} />
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={styles.canvasMessage}>
            <Notice tone="error" title="That tree did not load">
              {error instanceof Error ? error.message : 'The chart could not be read.'}
            </Notice>
            <View style={styles.rowWrap}>
              <LButton label="Try again" onPress={() => refetch()} />
              <LButton label="Import a syllabus" variant="primary" onPress={onImport} />
            </View>
          </View>
        ) : isPending || !data ? (
          <View style={styles.canvasMessage}>
            <Skeleton width="45%" />
            <Skeleton width="70%" />
            <Skeleton width="30%" />
          </View>
        ) : (
          <View style={styles.canvasStage}>
            {/* The student's field, in the student's tokens. Restyling it toward
                this surface would stop it answering the only question it is
                here for: what does this look like when it is handed over. */}
            <DitherField variant="chart" flat={flat} />
          <SkillTree
            viewportKey={`instructor:${course.id}`}
              tree={editMode && canEdit ? shown : liveShown ?? data.tree}
              masteredIds={data.masteredIds}
              selectedId={selected?.id ?? null}
              onSelectNode={selectNode}
              reduceMotion={motionOff}
              lowBandwidth={flat}
              editMode={editMode}
              linkMode={linkMode}
              linkSourceId={linkSourceId}
              linkNotice={linkNotice}
              onToggleEditMode={
                canEdit
                  ? (next) => {
                      setEditMode(next);
                      if (!next) {
                        cancelLink();
                        // Leaving edit mode flips `live` back to the server row.
                        // An open form would keep editing against it and record
                        // a `before` the draft never held — the same corruption
                        // gating the button closes, arriving the other way.
                        setEditingId(null);
                      }
                    }
                  : undefined
              }
              onAddNode={canEdit ? addNode : undefined}
              onToggleLinkMode={canEdit ? startLink : undefined}
              onCancelLink={canEdit ? cancelLink : undefined}
              // "Archive, never delete" is the safety decision this feature rests
              // on; the tool that does it should not say the opposite.
              deleteLabel="RETIRE NODE"
              onDeleteNode={canEdit ? archiveSelected : undefined}
              // `useNodeLayout` is a device-local arrangement of someone else's
              // chart. An instructor's move is a real coordinate that publishes.
              positions={undefined}
              onMoveNode={canEdit ? moveNode : undefined}
            />
          </View>
        )}
      </View>

      {/* Below `lms.wide` the tree renders outside the page's ScrollView so the
          canvas can be panned. A form stacked under it would squeeze the canvas
          to its floor and then clip with no way to scroll to the bottom, so the
          same inspector arrives as a sheet over the chart instead. */}
      {wide ? (
        <View style={[styles.inspector, styles.inspectorWide]}>
          <ScrollView contentContainerStyle={styles.inspectorScroll}>{inspectorBody}</ScrollView>
        </View>
      ) : (
        <LModal
          visible={Boolean(live)}
          title={live?.title ?? 'Node'}
          onRequestClose={() => {
            setSelected(null);
            setEditingId(null);
          }}
        >
          <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR}>
            <ScrollView style={modalScroll} contentContainerStyle={styles.inspectorScroll}>
              {inspectorBody}
            </ScrollView>
          </KeyboardAvoidingView>
        </LModal>
      )}
      </View>

      {/* Outside the section's layout on purpose. Anything absolutely positioned
          inside it renders below the nav drawer, a later sibling of `main`. */}
      <LModal visible={confirming} title="Publish changes" onRequestClose={() => setConfirming(false)}>
        {/* Only the reading scrolls; the actions stay pinned below it, so a long
            impact list can never push Publish off the bottom of the screen. */}
        <ScrollView style={modalScroll} contentContainerStyle={styles.dialogScroll}>
        <LText variant="small" tone="muted">
          {countChanges(changes)} change{countChanges(changes) === 1 ? '' : 's'} will reach students.
        </LText>

        {impact.length > 0 ? (
          <Notice tone="attention" title="Retiring work students have done">
            {impact.map((row) => (
              <LText key={row.nodeId} variant="small">
                {row.title} — {row.studentsCompleted} student
                {row.studentsCompleted === 1 ? '' : 's'} cleared it, {row.missionsHidden} mission
                {row.missionsHidden === 1 ? '' : 's'} hidden, {row.danglingEdges} connection
                {row.danglingEdges === 1 ? '' : 's'} dropped
                {row.helpDescendants > 0 ? `, ${row.helpDescendants} help step${row.helpDescendants === 1 ? '' : 's'} hidden with it` : ''}.
                Their XP stays banked and nothing is deleted, so this is reversible
                while it is unpublished, and by Undo publish straight afterwards.
              </LText>
            ))}
          </Notice>
        ) : null}

        {publishError ? <Notice tone="error" title="Not published">{publishError}</Notice> : null}

        {changes.deleteMissions.length > 0 ? (
          <Notice tone="error" title="Deleting missions cannot be undone">
            {changes.deleteMissions.length} mission
            {changes.deleteMissions.length === 1 ? '' : 's'} will be removed. Every student&rsquo;s record
            of completing them goes with it, and Undo publish cannot bring those records back.
            Retiring the whole node instead keeps them.
          </Notice>
        ) : null}
        </ScrollView>

        <View style={styles.rowWrap}>
          <LButton
            label={publishing ? 'Publishing…' : 'Publish'}
            variant={hasDestructiveChanges(changes) ? 'danger' : 'primary'}
            disabled={publishing}
            onPress={doPublish}
          />
          <LButton label="Cancel" variant="quiet" disabled={publishing} onPress={() => setConfirming(false)} />
        </View>
      </LModal>

      <LModal
        visible={catalogConfirming}
        title="Publish to the official catalog"
        onRequestClose={() => !catalogPublishing && setCatalogConfirming(false)}
      >
        {verification.data ? (
          <>
            <LText variant="small" tone="muted">
              Every signed-in student will be able to discover and join {course.title}. Its learner
              leaderboard stays separate from every other course, and you will not appear in it.
            </LText>
            <Notice tone="attention" title="Review the chart first">
              Catalog publication exposes the currently saved chart. Publish any pending chart edits before continuing.
            </Notice>
          </>
        ) : verification.isError ? (
          <Notice tone="error" title="Verification could not be checked">
            Check the database connection and try again. No course has been published.
          </Notice>
        ) : (
          <Notice tone="attention" title="This account cannot publish">
            An instructor account carries publishing rights from the day it registers, so an account
            without them either registered as a student or had them withdrawn. An administrator can
            restore them.
          </Notice>
        )}
        {catalogError ? <Notice tone="error" title="Not published">{catalogError}</Notice> : null}
        <View style={styles.rowWrap}>
          {verification.data ? (
            <LButton
              label={catalogPublishing ? 'Publishing…' : 'Publish official course'}
              variant="primary"
              disabled={catalogPublishing}
              onPress={doPublishOfficial}
            />
          ) : verification.isError ? (
            <LButton label="Retry verification" onPress={() => void verification.refetch()} />
          ) : null}
          <LButton
            label="Cancel"
            variant="quiet"
            disabled={catalogPublishing}
            onPress={() => setCatalogConfirming(false)}
          />
        </View>
      </LModal>
    </>
  );
}

// ------------------------------------------------------------------- students


/**
 * What the inspector shows while nothing is being edited. The rail and the
 * narrow-screen sheet wrap it differently and must otherwise render exactly the
 * same thing.
 *
 * Read-only on purpose: the editing controls are `NodeEditorPanel`, shared with
 * the student chart, so there is one node property panel in this repo and not
 * two that drift.
 */
function NodeInspector({
  node,
  prereqCount,
  canEdit,
  onStartEdit,
}: {
  node: SkillNode | null;
  prereqCount: number;
  canEdit: boolean;
  onStartEdit: () => void;
}) {
  if (!node) {
    return (
      <View style={styles.inspectorSection}>
        <LText variant="section">No cell selected</LText>
        <LText variant="small" tone="muted">
          Pick a cell on the chart to see what it is worth and what it opens after. The chart is
          drawn exactly as a student receives it.
        </LText>
      </View>
    );
  }

  return (
    <>
      <View style={styles.inspectorSection}>
        {/* The name a reader sees, not the syllabus line underneath it. An
            author who renames a node and is still shown "New node" here has no
            way to tell whether the rename saved — and the caption above this
            panel promises the chart is drawn as a student receives it. */}
        <LText variant="section">{resolveQuestName(node).text}</LText>
        <View style={styles.rowWrap}>
          <Badge label={node.kind} tone="brand" />
          {node.graded === false ? <Badge label="Ungraded practice" tone="gold" /> : null}
          {node.archived ? <Badge label="Retired" tone="attention" /> : null}
        </View>
      </View>

      <View style={styles.inspectorSection}>
        <Figure label="XP" value={String(node.xpReward)} />
        <Figure label="Prerequisites" value={String(prereqCount)} />
      </View>

      {node.description ? (
        <View style={styles.inspectorSection}>
          <LText variant="micro" tone="muted">What it covers</LText>
          <LText variant="small">{node.description}</LText>
        </View>
      ) : null}

      {canEdit ? (
        <LButton label="Edit this node" icon="edit-3" onPress={onStartEdit} />
      ) : null}
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <LText variant="small" tone="muted">
        {label}
      </LText>
      <LText variant="small" numeric style={styles.strong}>
        {value}
      </LText>
    </View>
  );
}

