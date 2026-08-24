import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  FadeInRight,
  FadeOutRight,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, G, Marker, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { ChartTools } from '@/ui/ChartTools';
import { Bevel, PixelText, bevelStyle, type PressState } from '@/ui/pixel';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme/useTheme';
import { instanceNamespace } from '@/theme/dither';
import { bevel, motion, space, touch } from '@/theme/tokens';
import type { ThemePalette } from '@/theme/themes';
import type { NodePosition, PositionMap } from '@/lib/nodeLayout';
import {
  bendsOf,
  arrowheadPoints,
  crossbarByPrereq,
  edgeWaypoints,
  orthogonalPath,
  type Routing,
} from './edgeRouting';
import {
  FIT_PAD,
  MAX_SCALE,
  MIN_SCALE,
  boundsOf,
  fitTransform,
  focusTransform,
  toWorld,
  zoomAbout,
  type Transform,
} from './chartViewport';
import { deriveStatuses, nextQuests } from './progression';
import type { Prereq, SkillNode, Tree } from './types';
import { autoLayout } from './autoLayout';
import { displayStatus, type DisplayStatus } from './nodeVisualState';
import { currentFocusNodes } from './chartFocus';
import { miniMapGeometry, projectToMiniMap } from './minimap';
import { CanvasGestureSurface, type WheelPoint } from './CanvasGestureSurface';
import { useCanvasViewport } from './CanvasViewportProvider';
import { PIXEL_ICON_BITMAPS, resolvePixelIcon } from './pixelIcons';
import { NodePulse } from './NodePulse';
import { BoundedCache } from '@/lib/BoundedCache';

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
/** Up to four syllabus words at 16dp line height, plus the gap under the cell. */
const LABEL_BLOCK = 76;
const LABEL_WIDTH = 132;

/**
 * Open ground kept around the content on every side, in dp.
 *
 * This is the room a node can be dragged into. It is generous rather than
 * infinite because the edge layer is one SVG with a real size, and an edge
 * running outside it would be clipped — panning past this shows empty field,
 * which is the honest end of the canvas rather than a broken line.
 */
const CANVAS_PAD = 900;

const CHART_ROUTING: Routing = {
  axis: 'horizontal',
  // The last point is the arrow tip, so HALF docks it on the cell perimeter.
  // Extra clearance here is what used to leave a visible floating gap.
  in: HALF,
  out: HALF,
  elbowMin: 8,
  arrow: 11,
};
/** A drag that never leaves the touch target was a tap on the node. */
const DRAG_SLOP = 4;

interface Props {
  viewportKey: string;
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
  /** Fraction of mission XP claimed for each node. Drives IN PROGRESS. */
  progressByNode?: Readonly<Record<string, number>>;
  /** Changes whenever navigation returns to this chart and requests active-work focus. */
  focusRequestKey?: number;
  editMode?: boolean;
  linkMode?: boolean;
  linkSourceId?: string | null;
  linkNotice?: string | null;
  onToggleEditMode?: (next: boolean) => void;
  onAddNode?: (at: NodePosition) => void;
  onToggleLinkMode?: () => void;
  onCancelLink?: () => void;
  onDeleteNode?: () => void;
  /**
   * What the destructive tool is called. Defaults to DELETE NODE, which is true
   * on the student screen: that one really does drop the node from a local
   * draft. The instructor path archives instead, and "archive, never delete" is
   * the safety decision this whole feature rests on, so it says so there.
   */
  deleteLabel?: string;
}

interface Placed extends SkillNode {
  /** Position on the canvas layer, in dp, before the transform. */
  px: number;
  py: number;
}

interface CachedGraphLayout {
  key: string;
  positions: PositionMap;
}

/** Retains recent graph coordinates without accumulating every course ever opened. */
const graphLayoutCache = new BoundedCache<string, CachedGraphLayout>(12);

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

export function SkillTree(props: Props) {
  const layoutKey = `${props.viewportKey}:${props.tree.nodes.length}`;
  const treeRef = useRef(props.tree);
  treeRef.current = props.tree;
  const needsLayout = props.tree.nodes.some(
    (node) => !Number.isFinite(node.x) || !Number.isFinite(node.y),
  );
  const [cachedLayout, setCachedLayout] = useState<CachedGraphLayout | null>(
    () => graphLayoutCache.get(layoutKey) ?? null,
  );

  useEffect(() => {
    if (!needsLayout) return;
    const cached = graphLayoutCache.get(layoutKey);
    const cacheMatches = cached && treeRef.current.nodes.every((node) => cached.positions[node.id]);
    if (cached && cacheMatches) {
      setCachedLayout(cached);
      return;
    }
    if (cached) graphLayoutCache.delete(layoutKey);
    let live = true;
    const task = setTimeout(() => {
      const input = treeRef.current;
      const laidOut = autoLayout(input.nodes, input.prereqs).nodes;
      const next: CachedGraphLayout = {
        key: layoutKey,
        positions: Object.fromEntries(laidOut.map((node) => [node.id, { x: node.x, y: node.y }])),
      };
      graphLayoutCache.set(layoutKey, next);
      if (live) setCachedLayout(next);
    }, 0);
    return () => {
      live = false;
      clearTimeout(task);
    };
  }, [layoutKey, needsLayout]);

  const activeLayout = cachedLayout?.key === layoutKey
    && props.tree.nodes.every((node) => cachedLayout.positions[node.id])
    ? cachedLayout
    : null;
  const resolvedTree = useMemo<Tree>(() => {
    if (!needsLayout || !activeLayout) return props.tree;
    return {
      ...props.tree,
      nodes: props.tree.nodes.map((node) => ({
        ...node,
        ...(activeLayout.positions[node.id] ?? {}),
      })),
    };
  }, [activeLayout, needsLayout, props.tree]);

  if (needsLayout && !activeLayout) {
    return <RetroGraphLoader reduceMotion={Boolean(props.reduceMotion)} />;
  }
  return <SkillTreeCanvas {...props} tree={resolvedTree} />;
}

function RetroGraphLoader({ reduceMotion }: { reduceMotion: boolean }) {
  const { theme } = useAppTheme();
  const spin = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    spin.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [reduceMotion, spin]);
  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${Math.floor(spin.value * 4) * 90}deg` }],
  }));
  return (
    <View style={[styles.loading, { backgroundColor: theme.background }]} accessibilityRole="progressbar">
      <Animated.View
        style={[
          styles.loadingGlyph,
          { borderColor: theme.nodeActive.border, borderRightColor: theme.background },
          spinnerStyle,
        ]}
      />
      <PixelText variant="label" colour={theme.textPrimary}>INITIALIZING NEURAL PATHWAYS...</PixelText>
      <PixelText variant="micro" colour={theme.textMuted}>PARSING SKILL TREE</PixelText>
    </View>
  );
}

function SkillTreeCanvas({
  viewportKey,
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
  progressByNode = {},
  focusRequestKey = 0,
  editMode,
  linkMode,
  linkSourceId,
  linkNotice,
  deleteLabel,
  onToggleEditMode,
  onAddNode,
  onToggleLinkMode,
  onCancelLink,
  onDeleteNode,
}: Props) {
  const { theme } = useAppTheme();
  const t = useTheme();
  // Arrowheads are document-wide definitions on the web, and two charts can be
  // mounted at once — the student's tree and the instructor's authoring canvas.
  // A shared name means the second chart points its edges at the first chart's
  // markers, in the first chart's colours. See `instanceNamespace`.
  const markerNs = instanceNamespace('arrow', useId());
  const viewportStore = useCanvasViewport();
  const restoredViewport = useRef(viewportStore.read(viewportKey));
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [scaleReadout, setScaleReadout] = useState(restoredViewport.current?.scale ?? 1);
  const cameraX = useSharedValue(restoredViewport.current?.x ?? 0);
  const cameraY = useSharedValue(restoredViewport.current?.y ?? 0);
  const cameraScale = useSharedValue(restoredViewport.current?.scale ?? 1);
  /** Set only while a node is being dragged, so the commit happens once at the end. */
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null);

  const laidOutTree = tree;

  const { status, nodes, canvas, origin, recommendedId, openedIds } = useMemo(() => {
    const { status } = deriveStatuses(laidOutTree, masteredIds);

    // A dragged position replaces the authored one, in tree units, so the two
    // are interchangeable everywhere below this line.
    const at = (n: SkillNode) => positions?.[n.id] ?? { x: n.x, y: n.y };
    const dp = laidOutTree.nodes.map((n) => {
      const p = at(n);
      return { x: p.x * SCALE_X, y: p.y * SCALE_Y };
    });

    const box = boundsOf(dp, CANVAS_PAD);
    const placed: Placed[] = laidOutTree.nodes.map((n, i) => ({
      ...n,
      px: dp[i]!.x - box.minX,
      py: dp[i]!.y - box.minY,
    }));

    // What the most recent completion opened. This is what the wipe is for, and
    // what the student is actually being told.
    const before = recentlyMasteredId
      ? deriveStatuses(
          laidOutTree,
          masteredIds.filter((id) => id !== recentlyMasteredId),
        ).status
      : null;

    return {
      status,
      nodes: placed,
      canvas: { width: box.maxX - box.minX, height: box.maxY - box.minY },
      origin: { x: box.minX, y: box.minY },
      // `undefined` means the caller has no opinion; `null` means it ranked and
      // found nothing. Only the first falls back to the chart's own pick.
      recommendedId:
        recommendedIdProp !== undefined
          ? recommendedIdProp
          : (nextQuests(laidOutTree, masteredIds, 1)[0]?.id ?? null),
      openedIds: new Set(
        before
          ? laidOutTree.nodes
              .filter((n) => status.get(n.id) === 'available' && before.get(n.id) === 'locked')
              .map((n) => n.id)
          : [],
      ),
    };
  }, [laidOutTree, masteredIds, recentlyMasteredId, recommendedIdProp, positions]);

  const wipe = useWipe(recentlyMasteredId, !reduceMotion);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);
  const activeCrossbars = useMemo(
    () =>
      crossbarByPrereq(
        nodes.map((node) => ({ id: node.id, ...live(node, dragging) })),
        laidOutTree.prereqs.map((p) => ({ from: p.prereqId, to: p.nodeId })),
        CHART_ROUTING,
      ),
    [dragging, laidOutTree.prereqs, nodes],
  );

  const setCamera = useCallback(
    (next: Transform, animated = true, animationDuration: number = motion.flash) => {
      const duration = reduceMotion || !animated ? 0 : animationDuration;
      const timing = { duration, easing: Easing.out(Easing.cubic) };
      cameraX.value = duration ? withTiming(next.x, timing) : next.x;
      cameraY.value = duration ? withTiming(next.y, timing) : next.y;
      cameraScale.value = duration ? withTiming(next.scale, timing) : next.scale;
      setScaleReadout(next.scale);
      viewportStore.write(viewportKey, next);
    },
    [cameraScale, cameraX, cameraY, reduceMotion, viewportKey, viewportStore],
  );

  const fit = useCallback(() => {
    // Fit to the nodes, not to the canvas — the canvas is mostly the open ground
    // that exists to be dragged into, and fitting to it would frame nothing.
    const marks = nodes.map((n) => ({ x: n.px, y: n.py }));
    setCamera(fitTransform(boundsOf(marks, CELL + LABEL_BLOCK), viewport, FIT_PAD));
  }, [nodes, setCamera, viewport]);

  const focusCurrentWork = useCallback((animated: boolean) => {
    if (editMode) {
      fit();
      return;
    }
    const focusNodes = currentFocusNodes(nodes, status, progressByNode, recommendedId);
    if (focusNodes.length === 0) {
      fit();
      return;
    }
    const marks = focusNodes.map((node) => ({ x: node.px, y: node.py }));
    setCamera(
      focusTransform(boundsOf(marks, CELL + LABEL_BLOCK), viewport),
      animated,
      motion.unlock,
    );
  }, [editMode, fit, nodes, progressByNode, recommendedId, setCamera, status, viewport]);

  // The route stays mounted behind other tabs. A navigation focus request must
  // therefore move the camera again, not only when this component first mounts.
  const focusedRequest = useRef<number | null>(null);
  useEffect(() => {
    if (
      focusedRequest.current === focusRequestKey
      || viewport.width === 0
      || viewport.height === 0
      || nodes.length === 0
    ) return;
    focusedRequest.current = focusRequestKey;
    focusCurrentWork(true);
  }, [focusCurrentWork, focusRequestKey, nodes.length, viewport.height, viewport.width]);

  /** Camera coordinates stay on the UI thread; React only receives the scale readout. */
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);
  const pinchStartScale = useSharedValue(1);

  const persistCamera = useCallback(
    (x: number, y: number, scale: number) => {
      viewportStore.write(viewportKey, { x, y, scale });
    },
    [viewportKey, viewportStore],
  );

  const canvasGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(!editMode)
      .maxPointers(1)
      .minDistance(DRAG_SLOP)
      .onBegin(() => {
        cancelAnimation(cameraX);
        cancelAnimation(cameraY);
        panStartX.value = cameraX.value;
        panStartY.value = cameraY.value;
      })
      .onUpdate((event) => {
        cameraX.value = panStartX.value + event.translationX;
        cameraY.value = panStartY.value + event.translationY;
      })
      .onEnd(() => {
        runOnJS(persistCamera)(cameraX.value, cameraY.value, cameraScale.value);
      });

    const pinch = Gesture.Pinch()
      .onBegin(() => {
        cancelAnimation(cameraScale);
        pinchStartX.value = cameraX.value;
        pinchStartY.value = cameraY.value;
        pinchStartScale.value = cameraScale.value;
      })
      .onUpdate((event) => {
        const nextScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, pinchStartScale.value * event.scale),
        );
        const ratio = nextScale / pinchStartScale.value;
        cameraScale.value = nextScale;
        cameraX.value = event.focalX - (event.focalX - pinchStartX.value) * ratio;
        cameraY.value = event.focalY - (event.focalY - pinchStartY.value) * ratio;
        runOnJS(setScaleReadout)(nextScale);
      })
      .onEnd(() => {
        runOnJS(persistCamera)(cameraX.value, cameraY.value, cameraScale.value);
      });

    return Gesture.Simultaneous(pan, pinch);
  }, [cameraScale, cameraX, cameraY, editMode, panStartX, panStartY, persistCamera, pinchStartScale, pinchStartX, pinchStartY]);

  const cameraStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cameraX.value },
      { translateY: cameraY.value },
      { scale: cameraScale.value },
    ],
  }));

  const zoom = (factor: number) => {
    const current = { x: cameraX.value, y: cameraY.value, scale: cameraScale.value };
    setCamera(zoomAbout(current, factor, { x: viewport.width / 2, y: viewport.height / 2 }));
  };

  const wheelZoom = useCallback((factor: number, point: WheelPoint) => {
    const current = { x: cameraX.value, y: cameraY.value, scale: cameraScale.value };
    const nextScale = Math.min(2, Math.max(0.5, current.scale * factor));
    const next = zoomAbout(current, nextScale / current.scale, point);
    setCamera(next, false);
  }, [cameraScale, cameraX, cameraY, setCamera]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport((v) => (v.width === width && v.height === height ? v : { width, height }));
  };

  const edgeElements = useMemo(() => tree.prereqs.map(({ nodeId, prereqId }) => {
    const a = byId.get(prereqId);
    const b = byId.get(nodeId);
    if (!a || !b) return null;
    const targetStatus = status.get(nodeId) ?? 'locked';
    const targetProgress = progressByNode[nodeId] ?? 0;
    const isInProgress = targetStatus === 'available' && targetProgress > 0;
    const ink = targetStatus === 'mastered'
      ? theme.edgeCompleted
      : isInProgress
        ? theme.xpBarFill
        : targetStatus === 'available'
        ? theme.edgeActive
        : theme.edgeLocked;
    const markerName = targetStatus === 'mastered'
      ? 'completed'
      : isInProgress
        ? 'in-progress'
        : targetStatus === 'available'
        ? 'active'
        : 'locked';
    const points = edgeWaypoints(
      live(a, dragging),
      live(b, dragging),
      CHART_ROUTING,
      activeCrossbars.get(prereqId),
    );
    const drawing = prereqId === recentlyMasteredId ? wipe : 1;
    return (
      <G key={`${prereqId}->${nodeId}`} opacity={targetStatus === 'locked' ? 0.72 : 1}>
        <Path
          d={orthogonalPath(points)}
          fill="none"
          stroke={ink}
          strokeWidth={targetStatus === 'locked' ? 2 : 3}
          strokeLinejoin="miter"
          strokeDasharray={targetStatus === 'locked' ? '6 6' : drawing < 1 ? '4 6' : undefined}
          opacity={drawing < 1 ? 0.35 + drawing * 0.65 : 1}
          markerEnd={`url(#${markerNs}-${markerName})`}
        />
        {/* SVG markers are retained for browser semantics, while this matching
            polygon guarantees the direction cue survives react-native-svg on
            iOS and Android. It is the same shape and colour, so supported
            renderers simply paint the arrow twice in exactly the same place. */}
        <Polygon
          points={arrowheadPoints(points, targetStatus === 'locked' ? 9 : 11)}
          fill={ink}
          strokeLinejoin="miter"
        />
        {bendsOf(points, 2 * CHART_ROUTING.elbowMin).map((bend, index) => (
          <Rect key={index} x={bend.x - 3} y={bend.y - 3} width={6} height={6} fill={ink} />
        ))}
      </G>
    );
  }), [activeCrossbars, byId, dragging, markerNs, progressByNode, recentlyMasteredId, status, theme, tree.prereqs, wipe]);

  return (
    <View style={styles.chart} onLayout={onLayout}>
      <CanvasGestureSurface
        gesture={canvasGesture}
        onWheelZoom={wheelZoom}
        connecting={Boolean(linkMode)}
        onCancelConnect={onCancelLink}
      >
      <Pressable style={styles.fill} onPress={linkMode ? onCancelLink : undefined}>
        <Animated.View
          style={[
            styles.layer,
            {
              width: canvas.width,
              height: canvas.height,
              // Scaling a layer scales it about its centre, so the origin has to
              // be pinned to the top-left or the offset means something
              // different at every zoom.
              transformOrigin: 'top left',
            },
            cameraStyle,
          ]}
          pointerEvents="box-none"
        >
          <Svg
            width={canvas.width}
            height={canvas.height}
            style={[StyleSheet.absoluteFill, styles.edgeLayer]}
          >
            <Defs>
              {([
                ['completed', theme.edgeCompleted],
                ['active', theme.edgeActive],
                ['in-progress', theme.xpBarFill],
                ['locked', theme.edgeLocked],
              ] as const).map(([name, colour]) => (
                <Marker
                  key={name}
                  id={`${markerNs}-${name}`}
                  viewBox="0 0 10 10"
                  markerWidth={name === 'locked' ? 7 : 8}
                  markerHeight={name === 'locked' ? 7 : 8}
                  refX={8}
                  refY={5}
                  orient="auto-start-reverse"
                  markerUnits="userSpaceOnUse"
                >
                  <Path d="M 0 1 L 8 5 L 0 9 Z" fill={colour} />
                </Marker>
              ))}
            </Defs>
            {edgeElements}

          </Svg>

          {nodes.map((node) => (
            <NodeCell
              key={node.id}
              node={node}
              at={live(node, dragging)}
              status={displayStatus(status.get(node.id) ?? 'locked', progressByNode[node.id] ?? 0)}
              progress={progressByNode[node.id] ?? 0}
              selected={node.id === selectedId}
              recommended={node.id === recommendedId}
              wipe={openedIds.has(node.id) ? wipe : 1}
              celebrating={node.id === recentlyMasteredId}
              linkSource={Boolean(linkMode && node.id === linkSourceId)}
              reduceMotion={Boolean(reduceMotion)}
              theme={theme}
              movable={Boolean(editMode)}
              scale={scaleReadout}
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
        </Animated.View>
      </Pressable>
      </CanvasGestureSurface>

      {linkMode && onCancelLink ? (
        <Bevel tone="panel" style={styles.linkBanner}>
          <PixelText variant="micro" colour={theme.textPrimary}>
            {linkNotice ?? 'CLICK TARGET NODE TO CONNECT'}
          </PixelText>
          <Pressable
            onPress={onCancelLink}
            accessibilityRole="button"
            accessibilityLabel="Cancel connecting nodes"
            style={({ pressed }: PressState) => [styles.linkCancel, bevelStyle(t, 'panel', pressed ? 'inset' : 'raised')]}
          >
            <PixelText variant="micro" colour={theme.nodeCompleted.border}>CANCEL</PixelText>
          </Pressable>
        </Bevel>
      ) : linkNotice ? (
        <Bevel tone="panel" style={styles.linkBanner}>
          <PixelText variant="micro" colour={theme.textPrimary}>{linkNotice}</PixelText>
        </Bevel>
      ) : null}

      <View style={styles.chartHud} pointerEvents="box-none">
        <View style={styles.hudControls} pointerEvents="box-none">
          {editMode && onAddNode && onToggleLinkMode ? (
            <EditToolbar
              linkMode={Boolean(linkMode)}
              linkSourceId={linkSourceId}
              selected={Boolean(selectedId)}
              reduceMotion={Boolean(reduceMotion)}
              deleteLabel={deleteLabel}
              onAdd={() => {
                if (nodes.length === 0) {
                  focusedRequest.current = null;
                  onAddNode({ x: 0, y: 0 });
                  return;
                }
                const world = toWorld(
                  { x: viewport.width / 2, y: viewport.height / 2 },
                  { x: cameraX.value, y: cameraY.value, scale: cameraScale.value },
                );
                onAddNode({ x: (world.x + origin.x) / SCALE_X, y: (world.y + origin.y) / SCALE_Y });
              }}
              onLink={onToggleLinkMode}
              onDelete={onDeleteNode}
              onReset={onResetLayout}
              onExit={() => onToggleEditMode?.(false)}
            />
          ) : null}
          <ChartTools
            editMode={editMode}
            onToggleEditMode={onToggleEditMode}
            onZoomIn={() => zoom(1.25)}
            onZoomOut={() => zoom(0.8)}
            onFit={fit}
            scale={scaleReadout}
          />
        </View>
        <MiniMap
          nodes={nodes}
          prereqs={laidOutTree.prereqs}
          cameraX={cameraX}
          cameraY={cameraY}
          cameraScale={cameraScale}
          viewport={viewport}
          onReset={fit}
          theme={theme}
        />
      </View>
    </View>
  );
}

function EditToolbar({ linkMode, linkSourceId, selected, reduceMotion, deleteLabel, onAdd, onLink, onDelete, onReset, onExit }: {
  linkMode: boolean;
  linkSourceId?: string | null;
  selected: boolean;
  reduceMotion: boolean;
  deleteLabel?: string;
  onAdd: () => void;
  onLink: () => void;
  onDelete?: () => void;
  onReset?: () => void;
  onExit: () => void;
}) {
  const t = useTheme();
  const actions = [
    { label: '+ ADD NODE', onPress: onAdd, disabled: false },
    { label: linkMode && linkSourceId ? 'PICK TARGET' : 'CONNECT', onPress: onLink, disabled: false },
    { label: deleteLabel ?? 'DELETE NODE', onPress: onDelete, disabled: !selected },
    { label: 'RESET POSITIONS', onPress: onReset, disabled: !onReset },
    { label: 'EXIT EDIT', onPress: onExit, disabled: false },
  ];
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInRight.duration(200)}
      exiting={reduceMotion ? undefined : FadeOutRight.duration(200)}
      style={styles.editToolbar}
    >
    <Bevel tone="panel" style={styles.editToolbarInner} accessibilityLabel="Tree edit tools">
      {actions.map((action) => (
        <Pressable
          key={action.label}
          onPress={action.onPress}
          disabled={action.disabled}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: action.disabled }}
          style={({ pressed }: PressState) => [
            styles.editAction,
            bevelStyle(t, action.disabled ? 'panel' : 'brand', pressed ? 'inset' : 'raised'),
            action.disabled ? { opacity: 0.45 } : null,
          ]}
        >
          <PixelText variant="micro" colour={action.disabled ? t.inkMuted : t.brandInk}>{action.label}</PixelText>
        </Pressable>
      ))}
    </Bevel>
    </Animated.View>
  );
}

/** Where a node is right now, including a drag that has not been committed. */
function live(node: Placed, dragging: { id: string; x: number; y: number } | null) {
  if (dragging?.id !== node.id) return { x: node.px, y: node.py };
  return { x: node.px + dragging.x, y: node.py + dragging.y };
}

function MiniMap({
  nodes,
  prereqs,
  cameraX,
  cameraY,
  cameraScale,
  viewport,
  onReset,
  theme,
}: {
  nodes: readonly Placed[];
  prereqs: readonly Prereq[];
  cameraX: SharedValue<number>;
  cameraY: SharedValue<number>;
  cameraScale: SharedValue<number>;
  viewport: { width: number; height: number };
  onReset: () => void;
  theme: ThemePalette;
}) {
  const width = 128;
  const height = 80;
  const geometry = useMemo(
    () => miniMapGeometry(nodes.map((node) => ({ x: node.px, y: node.py })), width, height, CELL),
    [nodes],
  );
  const miniatureById = useMemo(
    () =>
      new Map(
        nodes.map((node) => [node.id, projectToMiniMap({ x: node.px, y: node.py }, geometry)]),
      ),
    [geometry, nodes],
  );
  const { bounds, offsetX, offsetY, scale } = geometry;
  const frustumStyle = useAnimatedStyle(() => {
    const safeScale = cameraScale.value > 0 ? cameraScale.value : 1;
    return {
      left: offsetX + (-cameraX.value / safeScale - bounds.minX) * scale,
      top: offsetY + (-cameraY.value / safeScale - bounds.minY) * scale,
      width: Math.max(2, (viewport.width / safeScale) * scale),
      height: Math.max(2, (viewport.height / safeScale) * scale),
    };
  }, [bounds.minX, bounds.minY, offsetX, offsetY, scale, viewport.height, viewport.width]);

  return (
    <Pressable
      onPress={onReset}
      accessibilityRole="button"
      accessibilityLabel="Mini-map. Fit the whole chart on screen."
      style={({ pressed }) => [
        styles.miniMap,
        {
          backgroundColor: theme.hudBackground,
          borderColor: theme.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <Svg width={width} height={height}>
        {prereqs.map(({ prereqId, nodeId }) => {
          const from = miniatureById.get(prereqId);
          const to = miniatureById.get(nodeId);
          if (!from || !to) return null;
          const midX = (from.x + to.x) / 2;
          return (
            <Polyline
              key={`${prereqId}->${nodeId}`}
              points={`${from.x},${from.y} ${midX},${from.y} ${midX},${to.y} ${to.x},${to.y}`}
              fill="none"
              stroke={theme.edgeLocked}
              strokeWidth={1}
            />
          );
        })}
        {nodes.map((node) => (
          <Rect
            key={node.id}
            x={(miniatureById.get(node.id)?.x ?? 0) - 2}
            y={(miniatureById.get(node.id)?.y ?? 0) - 2}
            width={4}
            height={4}
            fill={theme.nodeActive.border}
          />
        ))}
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[styles.miniMapFrustum, { borderColor: theme.textPrimary }, frustumStyle]}
      />
    </Pressable>
  );
}

function NodeCell({
  node,
  at,
  status,
  progress,
  selected,
  recommended,
  wipe,
  celebrating,
  linkSource,
  reduceMotion,
  theme,
  movable,
  scale,
  onPress,
  onDrag,
  onDrop,
}: {
  node: Placed;
  at: { x: number; y: number };
  status: DisplayStatus;
  progress: number;
  selected: boolean;
  recommended: boolean;
  wipe: number;
  celebrating: boolean;
  linkSource: boolean;
  reduceMotion: boolean;
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
      : status === 'available' || status === 'in_progress'
        ? theme.nodeActive
        : theme.nodeLocked;
  const statusLabel =
    status === 'mastered'
      ? 'Mastered'
      : status === 'in_progress'
        ? 'In progress'
        : status === 'available'
          ? 'Available'
          : 'Locked';
  const statusGlyph = status === 'mastered' ? 'check' : status === 'locked' ? 'lock' : null;
  const subjectIcon = resolvePixelIcon(node);

  // A step generated to scaffold another node. Only an explicit `false` counts:
  // every node written before help subtrees existed came from a syllabus.
  const supplemental = node.graded === false;

  const label = `${supplemental ? 'Extra practice. ' : ''}${node.title}. ${statusLabel}. Worth ${
    node.xpReward
  } XP.${recommended ? ' Recommended next.' : ''}`;

  // Gesture callbacks read live handlers so connector updates never use a stale zoom.
  const live = useRef({ movable, scale, onDrag, onDrop, onPress });
  live.current = { movable, scale, onDrag, onDrop, onPress };

  const drag = useMemo(
    () =>
      Gesture.Pan()
        .enabled(movable)
        .maxPointers(1)
        .minDistance(DRAG_SLOP)
        .runOnJS(true)
        .onUpdate((event) => {
          live.current.onDrag(
            event.translationX / live.current.scale,
            event.translationY / live.current.scale,
          );
        })
        .onEnd((event) => {
          live.current.onDrop(
            event.translationX / live.current.scale,
            event.translationY / live.current.scale,
          );
        })
        .onFinalize((_event, success) => {
          if (!success) live.current.onDrag(0, 0);
        }),
    [movable],
  );

  return (
    <View
      style={[styles.node, { left: at.x - LABEL_WIDTH / 2, top: at.y - HALF }]}
      pointerEvents="box-none"
    >
      {/* The recommended next node wears the only blush mark on the screen. */}
      {status === 'available' || recommended || linkSource ? (
        <NodePulse
          reduceMotion={reduceMotion}
          style={[
            styles.halo,
            { borderColor: theme.nodeActive.glow ?? theme.nodeActive.border },
          ]}
        />
      ) : null}
      {recommended || linkSource ? (
        <View
          style={[
            styles.recommendedAura,
            { borderColor: theme.nodeActive.glow ?? theme.nodeActive.border },
          ]}
          pointerEvents="none"
        />
      ) : null}

      {celebrating ? <Sparkles colour={theme.nodeCompleted.glow ?? theme.nodeCompleted.border} wipe={wipe} /> : null}

      <GestureDetector gesture={drag}>
      <View style={styles.cellWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: status === 'locked', selected }}
          accessibilityHint={movable ? 'Drag to move this node.' : undefined}
          onPress={(event) => {
            event.stopPropagation();
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
              backgroundColor: selected ? theme.surfaceHover : s.background,
              borderWidth: bevel,
              borderColor: s.border,
              borderStyle: supplemental ? 'dashed' : 'solid',
            },
            pressed || (hovered && !movable) ? { opacity: 0.85 } : null,
            wipe < 1 ? { opacity: 0.35 + wipe * 0.65 } : null,
          ]}
        >
          <Glyph kind={statusGlyph} iconKey={subjectIcon} colour={s.icon} />
        </Pressable>
        {status === 'in_progress' ? (
          <View style={[styles.nodeProgress, { backgroundColor: theme.xpBarBackground }]}>
            <View
              style={{
                width: `${Math.max(8, Math.round(progress * 100))}%`,
                height: '100%',
                backgroundColor: theme.xpBarFill,
              }}
            />
          </View>
        ) : null}
      </View>
      </GestureDetector>

      {selected ? (
        <View
          pointerEvents="none"
          style={[
            styles.selectionOuter,
            { borderColor: theme.nodeCompleted.border, shadowColor: theme.nodeCompleted.glow ?? theme.nodeCompleted.border },
          ]}
        />
      ) : null}
      {selected ? (
        <View
          pointerEvents="none"
          style={[styles.selectionInner, { borderColor: theme.nodeActive.border }]}
        />
      ) : null}

      <PixelText
        variant="micro"
        colour={theme.textPrimary}
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
function Glyph({
  kind,
  iconKey,
  colour,
}: {
  kind: 'check' | 'lock' | null;
  iconKey: keyof typeof PIXEL_ICON_BITMAPS;
  colour: string;
}) {
  const u = 2.4;
  const cells: [number, number, number, number][] =
    kind === 'check'
      ? [
          [1, 4, 1, 1], [2, 5, 1, 1], [3, 6, 1, 1], [4, 5, 1, 1], [5, 4, 1, 1],
          [6, 3, 1, 1], [7, 2, 1, 1], [2, 4, 1, 1], [3, 5, 1, 1], [4, 4, 1, 1],
          [5, 3, 1, 1], [6, 2, 1, 1],
        ]
      : kind === 'lock'
        ? [[3, 1, 2, 1], [2, 2, 1, 2], [5, 2, 1, 2], [1, 4, 6, 3]]
        : PIXEL_ICON_BITMAPS[iconKey].flatMap((row, y) =>
            [...row].flatMap((pixel, x) => pixel === 'X' ? [[x, y, 1, 1] as [number, number, number, number]] : []),
          );

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

function Sparkles({ colour, wipe }: { colour: string; wipe: number }) {
  return (
    <View style={[styles.sparkles, { opacity: 0.35 + wipe * 0.65 }]} pointerEvents="none">
      {[
        { left: 0, top: 8 },
        { right: 0, top: 2 },
        { left: 8, bottom: 0 },
        { right: 5, bottom: 6 },
      ].map((at, index) => (
        <View key={index} style={[styles.spark, at, { backgroundColor: colour }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flex: 1, overflow: 'hidden' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.cell },
  loadingGlyph: { width: 28, height: 28, borderWidth: 4 },
  fill: { flex: 1 },
  layer: { position: 'absolute', left: 0, top: 0 },
  edgeLayer: { zIndex: 0 },
  miniMap: {
    width: 132,
    height: 84,
    flexShrink: 0,
    borderWidth: bevel,
    padding: 0,
    overflow: 'hidden',
  },
  miniMapFrustum: { position: 'absolute', borderWidth: 1 },
  chartHud: {
    position: 'absolute',
    zIndex: 3,
    top: space.cell,
    left: space.cell,
    right: space.cell,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: space.cell,
    overflow: 'visible',
  },
  hudControls: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: space.cell,
  },
  editToolbar: { maxWidth: '100%', flexShrink: 1, overflow: 'visible' },
  editToolbarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: space.xs,
    padding: space.xs,
    overflow: 'visible',
  },
  editAction: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space.cell },
  linkBanner: {
    position: 'absolute',
    zIndex: 2,
    top: space.cell,
    left: '20%',
    right: '20%',
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.cell,
    paddingHorizontal: space.cell,
  },
  linkCancel: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space.cell },
  node: { position: 'absolute', zIndex: 1, width: LABEL_WIDTH, alignItems: 'center' },
  halo: {
    position: 'absolute',
    left: LABEL_WIDTH / 2 - HALF,
    top: 0,
    width: CELL,
    height: CELL,
    borderWidth: 2,
  },
  recommendedAura: {
    position: 'absolute',
    left: LABEL_WIDTH / 2 - HALF - 11,
    top: -11,
    width: CELL + 22,
    height: CELL + 22,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  selectionOuter: {
    position: 'absolute',
    left: LABEL_WIDTH / 2 - HALF - 4,
    top: -4,
    width: CELL + 8,
    height: CELL + 8,
    borderWidth: 2,
    shadowOpacity: 0.75,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  selectionInner: {
    position: 'absolute',
    left: LABEL_WIDTH / 2 - HALF + 3,
    top: 3,
    width: CELL - 6,
    height: CELL - 6,
    borderWidth: 2,
  },
  sparkles: {
    position: 'absolute',
    left: LABEL_WIDTH / 2 - HALF - 10,
    top: -10,
    width: CELL + 20,
    height: CELL + 20,
  },
  spark: { position: 'absolute', width: 4, height: 4 },
  // Sized to the cell, not the label block: the dead space either side of a
  // short title belongs to the canvas, so a drag there still pans.
  cellWrap: { width: CELL, height: CELL },
  cell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' },
  nodeProgress: { position: 'absolute', left: 0, right: 0, bottom: -6, height: 4 },
  glyph: { ...StyleSheet.absoluteFillObject },
  label: { marginTop: space.md, width: LABEL_WIDTH, maxWidth: LABEL_WIDTH },
});
