import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { G, Path, Polygon, Rect } from 'react-native-svg';

import { ChartTools } from '@/ui/ChartTools';
import { PixelText, type PressState } from '@/ui/pixel';
import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, motion, space, touch } from '@/theme/tokens';
import type { ThemePalette } from '@/theme/themes';
import type { NodePosition, PositionMap } from '@/lib/nodeLayout';
import {
  arrowheadPoints,
  bendsOf,
  crossbarByPrereq,
  edgeWaypoints,
  orthogonalPath,
  type Routing,
} from './edgeRouting';
import {
  FIT_PAD,
  boundsOf,
  fitTransform,
  zoomAbout,
  type Transform,
} from './chartViewport';
import { deriveStatuses, nextQuests } from './progression';
import type { NodeStatus, SkillNode, Tree } from './types';

/**
 * The chart is an unbounded canvas you move around, not a page that scrolls.
 *
 * It used to be a pair of nested ScrollViews, which meant the graph could only
 * ever be as big as its content and a node could only ever sit where the
 * syllabus put it. A course tree is a diagram; people expect to push it around,
 * to spread a crowded branch out, and to see the whole thing at once. So:
 *
 *   * One transform — `{x, y, scale}` — applied to the layer holding everything.
 *     Panning is deliberately unclamped, because open ground to the side is
 *     where a node gets dragged to.
 *   * Nodes are real `Pressable` views, not `<G>` elements. That is what makes
 *     dragging work the same on a phone and a desktop, and it fixes a real
 *     accessibility hole: a role'd element inside `<svg>` is rewritten by
 *     react-native-web into a tag the browser drops, so the old chart's nodes
 *     were announced but could not be reached by keyboard at all.
 *   * The SVG underneath draws only what is genuinely a drawing: the edges, and
 *     the dithered fill of a locked cell.
 *
 * Everything is in tree coordinates until the transform is applied, so a moved
 * node's position means the same thing at any zoom.
 */

/**
 * Tree units to dp, before zoom. The two axes differ because edges are
 * orthogonal — the graph carries no angles worth preserving — and the vertical
 * needs more room, since every cell has two lines of label beneath it.
 */
const SCALE_X = 0.9;
const SCALE_Y = 1.3;

/** The cell is the touch target: 44dp, so the mark and the hit area are one. */
const CELL = touch;
const HALF = CELL / 2;
/** Two lines of label at 16dp line height, plus the gap under the cell. */
const LABEL_BLOCK = 44;
const LABEL_WIDTH = 108;

/**
 * Open ground kept around the content on every side, in dp.
 *
 * This is the room a node can be dragged into. It is generous rather than
 * infinite because the edge layer is one SVG with a real size, and an edge
 * running outside it would be clipped — panning past this shows empty field,
 * which is the honest end of the canvas rather than a broken line.
 */
const CANVAS_PAD = 900;

const CHART_ROUTING: Routing = { axis: 'horizontal', in: HALF + 6, out: HALF + 6, elbowMin: 8 };
const ARROW = 7;

/** A drag that never leaves the touch target was a tap on the node. */
const DRAG_SLOP = 4;

interface Props {
  tree: Tree;
  masteredIds: string[];
  selectedId?: string | null;
  onSelectNode: (node: SkillNode) => void;
  /** The node just marked complete. Drives the one authored motion moment. */
  recentlyMasteredId?: string | null;
  /** Pass `usePrefs().motionOff`. Skips the wipe; the end state is unchanged. */
  reduceMotion?: boolean;
  /** Pass `usePrefs().lowBandwidth`. Flattens the dithered fills. */
  lowBandwidth?: boolean;
  /**
   * Which node to outline as the one to do next. Omit and the chart picks it
   * with `nextQuests`; pass it when the screen ranks differently — the chart
   * and the bar under it must never recommend two different nodes.
   */
  recommendedId?: string | null;
  /** Where nodes have been dragged to. Absent ids sit where the syllabus put them. */
  positions?: PositionMap;
  onMoveNode?: (nodeId: string, at: NodePosition) => void;
  onResetLayout?: () => void;
}

interface Placed extends SkillNode {
  /** Position on the canvas layer, in dp, before the transform. */
  px: number;
  py: number;
}

/**
 * A five-step wipe, not an eased tween.
 *
 * This screen's motion vocabulary is the per-cell wipe: a region arrives a band
 * at a time, because a band at a time is all a sixteen-colour framebuffer could
 * do. Stepping it in code is the honest version of that, and it degrades to
 * "already finished" the moment reduce-motion is on.
 */
function useWipe(key: string | null | undefined, enabled: boolean): number {
  const steps = 5;
  const [step, setStep] = useState(steps);

  useEffect(() => {
    if (!enabled || !key) {
      setStep(steps);
      return;
    }
    setStep(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setStep(i);
      if (i >= steps) clearInterval(id);
    }, motion.unlock / steps);
    return () => clearInterval(id);
  }, [key, enabled]);

  return step / steps;
}

export function SkillTree({
  tree,
  masteredIds,
  selectedId,
  onSelectNode,
  recentlyMasteredId,
  reduceMotion,
  recommendedId: recommendedIdProp,
  positions,
  onMoveNode,
  onResetLayout,
}: Props) {
  const { theme } = useAppTheme();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [movable, setMovable] = useState(false);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  /** Set only while a node is being dragged, so the commit happens once at the end. */
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null);

  const { status, nodes, canvas, crossbars, recommendedId, openedIds } = useMemo(() => {
    const { status } = deriveStatuses(tree, masteredIds);

    // A dragged position replaces the authored one, in tree units, so the two
    // are interchangeable everywhere below this line.
    const at = (n: SkillNode) => positions?.[n.id] ?? { x: n.x, y: n.y };
    const dp = tree.nodes.map((n) => {
      const p = at(n);
      return { x: p.x * SCALE_X, y: p.y * SCALE_Y };
    });

    const box = boundsOf(dp, CANVAS_PAD);
    const placed: Placed[] = tree.nodes.map((n, i) => ({
      ...n,
      px: dp[i]!.x - box.minX,
      py: dp[i]!.y - box.minY,
    }));

    const crossbars = crossbarByPrereq(
      placed.map((n) => ({ id: n.id, x: n.px, y: n.py })),
      tree.prereqs.map((p) => ({ from: p.prereqId, to: p.nodeId })),
      CHART_ROUTING,
    );

    // What the most recent completion opened. This is what the wipe is for, and
    // what the student is actually being told.
    const before = recentlyMasteredId
      ? deriveStatuses(
          tree,
          masteredIds.filter((id) => id !== recentlyMasteredId),
        ).status
      : null;

    return {
      status,
      nodes: placed,
      canvas: { width: box.maxX - box.minX, height: box.maxY - box.minY },
      crossbars,
      // `undefined` means the caller has no opinion; `null` means it ranked and
      // found nothing. Only the first falls back to the chart's own pick.
      recommendedId:
        recommendedIdProp !== undefined
          ? recommendedIdProp
          : (nextQuests(tree, masteredIds, 1)[0]?.id ?? null),
      openedIds: new Set(
        before
          ? tree.nodes
              .filter((n) => status.get(n.id) === 'available' && before.get(n.id) === 'locked')
              .map((n) => n.id)
          : [],
      ),
    };
  }, [tree, masteredIds, recentlyMasteredId, recommendedIdProp, positions]);

  const wipe = useWipe(recentlyMasteredId, !reduceMotion);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);

  const fit = useCallback(() => {
    // Fit to the nodes, not to the canvas — the canvas is mostly the open ground
    // that exists to be dragged into, and fitting to it would frame nothing.
    const marks = nodes.map((n) => ({ x: n.px, y: n.py }));
    setTransform(fitTransform(boundsOf(marks, CELL + LABEL_BLOCK), viewport, FIT_PAD));
  }, [nodes, viewport]);

  // Open on the whole chart rather than its top-left corner, once there is a
  // measured viewport to fit it into.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || viewport.width === 0 || nodes.length === 0) return;
    fitted.current = true;
    fit();
  }, [fit, viewport.width, nodes.length]);

  /**
   * Dragging the background moves the canvas.
   *
   * Two refs, and both are load-bearing. `current` is the live transform, read
   * inside handlers that were created once. `origin` is where the transform was
   * when this gesture started — `dx`/`dy` are cumulative from that moment, so
   * adding them to a transform that is itself being updated would compound the
   * offset and send the canvas flying on the first drag.
   *
   * The responder is built once for the same reason: rebuilding it mid-gesture
   * leaves the in-flight drag running against stale closures.
   */
  const current = useRef(transform);
  current.current = transform;
  const origin = useRef<Transform | null>(null);
  const movableRef = useRef(movable);
  movableRef.current = movable;

  const canvasPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        /*
         * With nodes locked, a drag pans the canvas wherever it starts —
         * including on top of a node, whose `Pressable` would otherwise hold the
         * gesture and make the chart feel stuck. Capture is what takes it back.
         *
         * With nodes movable this stays out of the way, so the node's own
         * responder (deeper, and therefore later in the capture phase) wins.
         * Either way capture only fires past the slop, so a tap still selects.
         */
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          !movableRef.current && (Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP),
        // Empty ground, where nothing else wanted the gesture.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP,
        onPanResponderGrant: () => {
          origin.current = current.current;
        },
        onPanResponderMove: (_e, g) => {
          const from = origin.current;
          if (!from) return;
          setTransform({ ...from, x: from.x + g.dx, y: from.y + g.dy });
        },
        onPanResponderRelease: () => {
          origin.current = null;
        },
        onPanResponderTerminate: () => {
          origin.current = null;
        },
      }),
    [],
  );

  const zoom = (factor: number) =>
    setTransform((t) =>
      zoomAbout(t, factor, { x: viewport.width / 2, y: viewport.height / 2 }),
    );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport((v) => (v.width === width && v.height === height ? v : { width, height }));
  };

  return (
    <View style={styles.chart} onLayout={onLayout}>
      <View style={styles.fill} {...canvasPan.panHandlers}>
        <View
          style={[
            styles.layer,
            {
              width: canvas.width,
              height: canvas.height,
              transform: [
                { translateX: transform.x },
                { translateY: transform.y },
                { scale: transform.scale },
              ],
              // Scaling a layer scales it about its centre, so the origin has to
              // be pinned to the top-left or the offset means something
              // different at every zoom.
              transformOrigin: 'top left',
            },
          ]}
          pointerEvents="box-none"
        >
          <Svg width={canvas.width} height={canvas.height} style={StyleSheet.absoluteFill}>
            {tree.prereqs.map(({ nodeId, prereqId }) => {
              const a = byId.get(prereqId);
              const b = byId.get(nodeId);
              if (!a || !b) return null;

              const targetStatus = status.get(nodeId) ?? 'locked';
              const ink =
                targetStatus === 'mastered'
                  ? theme.edgeCompleted
                  : targetStatus === 'available'
                    ? theme.edgeActive
                    : theme.edgeLocked;
              const from = live(a, dragging);
              const to = live(b, dragging);
              const points = edgeWaypoints(from, to, CHART_ROUTING, crossbars.get(prereqId));
              // An edge leaving the node just completed draws itself in.
              const drawing = prereqId === recentlyMasteredId ? wipe : 1;

              return (
                <G key={`${prereqId}->${nodeId}`} opacity={targetStatus === 'locked' ? 0.72 : 1}>
                  <Path
                    d={orthogonalPath(points)}
                    fill="none"
                    stroke={ink}
                    strokeWidth={targetStatus === 'locked' ? 2 : 3}
                    strokeLinejoin="miter"
                    strokeDasharray={drawing < 1 ? '4 6' : undefined}
                    opacity={drawing < 1 ? 0.35 + drawing * 0.65 : 1}
                  />
                  <Polygon points={arrowheadPoints(points, ARROW)} fill={ink} />
                  {bendsOf(points, 2 * CHART_ROUTING.elbowMin).map((bend, i) => (
                    <Rect key={i} x={bend.x - 3} y={bend.y - 3} width={6} height={6} fill={ink} />
                  ))}
                </G>
              );
            })}

          </Svg>

          {nodes.map((node) => (
            <NodeCell
              key={node.id}
              node={node}
              at={live(node, dragging)}
              status={status.get(node.id) ?? 'locked'}
              selected={node.id === selectedId}
              recommended={node.id === recommendedId}
              wipe={openedIds.has(node.id) ? wipe : 1}
              theme={theme}
              movable={movable}
              scale={transform.scale}
              onPress={() => onSelectNode(node)}
              onDrag={(dx, dy) => setDragging({ id: node.id, x: dx, y: dy })}
              onDrop={(dx, dy) => {
                setDragging(null);
                const base = positions?.[node.id] ?? { x: node.x, y: node.y };
                onMoveNode?.(node.id, {
                  x: base.x + dx / SCALE_X,
                  y: base.y + dy / SCALE_Y,
                });
              }}
            />
          ))}
        </View>
      </View>

      <ChartTools
        movable={movable}
        onToggleMovable={setMovable}
        onZoomIn={() => zoom(1.25)}
        onZoomOut={() => zoom(0.8)}
        onFit={fit}
        onReset={onResetLayout && positions && Object.keys(positions).length > 0 ? onResetLayout : undefined}
        scale={transform.scale}
      />
    </View>
  );
}

/** Where a node is right now, including a drag that has not been committed. */
function live(node: Placed, dragging: { id: string; x: number; y: number } | null) {
  if (dragging?.id !== node.id) return { x: node.px, y: node.py };
  return { x: node.px + dragging.x, y: node.py + dragging.y };
}

function NodeCell({
  node,
  at,
  status,
  selected,
  recommended,
  wipe,
  theme,
  movable,
  scale,
  onPress,
  onDrag,
  onDrop,
}: {
  node: Placed;
  at: { x: number; y: number };
  status: NodeStatus;
  selected: boolean;
  recommended: boolean;
  wipe: number;
  theme: ThemePalette;
  movable: boolean;
  scale: number;
  onPress: () => void;
  onDrag: (dx: number, dy: number) => void;
  onDrop: (dx: number, dy: number) => void;
}) {
  const s =
    status === 'mastered'
      ? theme.nodeCompleted
      : status === 'available'
        ? theme.nodeActive
        : theme.nodeLocked;
  const statusLabel =
    status === 'mastered' ? 'Mastered' : status === 'available' ? 'Available' : 'Locked';
  const glyph = status === 'mastered' ? 'check' : status === 'available' ? 'play' : 'lock';

  // A step generated to scaffold another node. Only an explicit `false` counts:
  // every node written before help subtrees existed came from a syllabus.
  const supplemental = node.graded === false;

  const label = `${supplemental ? 'Extra practice. ' : ''}${node.title}. ${statusLabel}. Worth ${
    node.xpReward
  } XP.${recommended ? ' Recommended next.' : ''}`;

  // Built once and fed by refs. The handlers of an in-flight gesture are the
  // ones captured when it was granted, so a responder rebuilt on every render
  // would leave the drag reading a stale zoom and moving the node at the wrong
  // rate half way through.
  const moved = useRef(false);
  const live = useRef({ movable, scale, onDrag, onDrop, onPress });
  live.current = { movable, scale, onDrag, onDrop, onPress };

  /**
   * The drag lives on a wrapper around the cell, not on the cell itself.
   *
   * `Pressable` applies its own responder handlers *after* the props it is
   * given, so `{...panHandlers}` on a Pressable is silently discarded — the
   * toggle appeared to do nothing because of exactly that.
   *
   * Capture, not bubble: the Pressable claims the gesture the moment a finger
   * lands, so the only way to take a drag from it is to steal on movement.
   * Below the slop the Pressable keeps it and the tap still selects the node.
   */
  const drag = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          live.current.movable && (Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP),
        onPanResponderGrant: () => {
          moved.current = false;
        },
        // The gesture arrives in screen pixels; the canvas is drawn in its own
        // units, so it has to be divided by the zoom or the node outruns the
        // finger at anything but 100%.
        onPanResponderMove: (_e, g) => {
          moved.current = true;
          live.current.onDrag(g.dx / live.current.scale, g.dy / live.current.scale);
        },
        onPanResponderRelease: (_e, g) => {
          if (moved.current) {
            live.current.onDrop(g.dx / live.current.scale, g.dy / live.current.scale);
          }
        },
        onPanResponderTerminate: () => live.current.onDrag(0, 0),
      }),
    [],
  );

  return (
    <View
      style={[styles.node, { left: at.x - LABEL_WIDTH / 2, top: at.y - HALF }]}
      pointerEvents="box-none"
    >
      {/* The recommended next node wears the only blush mark on the screen. */}
      {recommended ? (
        <View
          style={[styles.halo, { borderColor: theme.nodeActive.glow ?? theme.nodeActive.border }]}
          pointerEvents="none"
        />
      ) : null}

      <View style={styles.cellWrap} {...drag.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: status === 'locked', selected }}
          accessibilityHint={movable ? 'Drag to move this node.' : undefined}
          onPress={() => {
            onPress();
            if (status === 'locked') {
              AccessibilityInfo.announceForAccessibility(
                `${node.title} is locked. Finish its prerequisites first.`,
              );
            }
          }}
          style={({ pressed, hovered }: PressState) => [
            styles.cell,
            {
              backgroundColor: s.background,
              borderWidth: bevel,
              borderColor: s.border,
              borderStyle: supplemental ? 'dashed' : 'solid',
            },
            selected ? { borderColor: theme.textPrimary } : null,
            pressed || (hovered && !movable) ? { opacity: 0.85 } : null,
            wipe < 1 ? { opacity: 0.35 + wipe * 0.65 } : null,
          ]}
        >
          <Glyph kind={glyph} colour={s.icon} />
        </Pressable>
      </View>

      <PixelText
        variant="micro"
        colour={theme.textPrimary}
        numberOfLines={2}
        centred
        style={styles.label}
      >
        {node.title}
      </PixelText>
    </View>
  );
}

/**
 * Status glyphs on the same 8×8 grid as the icon set, so a check on the chart is
 * the same object as a check in a list. Drawn as views rather than an SVG so a
 * cell is one element with one hit area.
 */
function Glyph({ kind, colour }: { kind: string; colour: string }) {
  const u = 2.4;
  const cells: [number, number, number, number][] =
    kind === 'check'
      ? [
          [1, 4, 1, 1], [2, 5, 1, 1], [3, 6, 1, 1], [4, 5, 1, 1], [5, 4, 1, 1],
          [6, 3, 1, 1], [7, 2, 1, 1], [2, 4, 1, 1], [3, 5, 1, 1], [4, 4, 1, 1],
          [5, 3, 1, 1], [6, 2, 1, 1],
        ]
      : kind === 'play'
        ? [[3, 1, 1, 6], [4, 2, 1, 4], [5, 3, 1, 2]]
        : [[3, 1, 2, 1], [2, 2, 1, 2], [5, 2, 1, 2], [1, 4, 6, 3]];

  return (
    <View style={styles.glyph} pointerEvents="none">
      {cells.map(([gx, gy, w, h], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: (gx - 4) * u + HALF - bevel,
            top: (gy - 4) * u + HALF - bevel,
            width: w * u,
            height: h * u,
            backgroundColor: colour,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flex: 1, overflow: 'hidden' },
  fill: { flex: 1 },
  layer: { position: 'absolute', left: 0, top: 0 },
  node: { position: 'absolute', width: LABEL_WIDTH, alignItems: 'center' },
  halo: {
    position: 'absolute',
    left: LABEL_WIDTH / 2 - HALF - 6,
    top: -6,
    width: CELL + 12,
    height: CELL + 12,
    borderWidth: 2,
  },
  // Sized to the cell, not the label block: the dead space either side of a
  // short title belongs to the canvas, so a drag there still pans.
  cellWrap: { width: CELL, height: CELL },
  cell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' },
  glyph: { ...StyleSheet.absoluteFillObject },
  label: { marginTop: space.xs, width: LABEL_WIDTH },
});
