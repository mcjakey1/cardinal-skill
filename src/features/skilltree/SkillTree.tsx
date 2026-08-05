import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  type AccessibilityProps,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Svg, { G, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { DitherDefs, ditherFill } from '@/ui/Dither';
import { font, motion, nodeStyle, palette, space } from '@/theme/tokens';
import {
  arrowheadPoints,
  bendsOf,
  crossbarByPrereq,
  edgeWaypoints,
  orthogonalPath,
  type Routing,
} from './edgeRouting';
import { deriveStatuses, nextQuests } from './progression';
import type { NodeStatus, SkillNode, Tree } from './types';

/**
 * The chart is laid out in device pixels, not in tree units scaled to fit.
 *
 * Fitting a whole syllabus into one viewport is what made the old chart
 * unreadable: at half scale a 12px label renders at six pixels and a node stops
 * being a touch target. So tree coordinates map to dp at a fixed scale and the
 * chart scrolls, which is what every skill tree a student has ever used does.
 *
 * The two axes scale differently on purpose. Edges are orthogonal, so the graph
 * carries no angles worth preserving, and the vertical needs more room than the
 * horizontal because every cell has two lines of label beneath it.
 */
const SCALE_X = 0.9;
const SCALE_Y = 1.3;
const PAD = 40;

/** The cell is the touch target: 44dp, so the mark and the hit area are one. */
const CELL = 44;
const HALF = CELL / 2;
/** Two lines of label at 16dp line height, plus the gap under the cell. */
const LABEL_BLOCK = 44;

const CHART_ROUTING: Routing = {
  axis: 'horizontal',
  in: HALF + 6,
  out: HALF + 6,
  elbowMin: 8,
};
const ARROW = 7;

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
}

interface Placed extends SkillNode {
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
  lowBandwidth,
}: Props) {
  const { status, nodes, size, crossbars, recommendedId, openedIds } = useMemo(() => {
    const { status } = deriveStatuses(tree, masteredIds);

    const xs = tree.nodes.map((n) => n.x);
    const ys = tree.nodes.map((n) => n.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);

    const placed: Placed[] = tree.nodes.map((n) => ({
      ...n,
      px: (n.x - minX) * SCALE_X + PAD,
      py: (n.y - minY) * SCALE_Y + PAD,
    }));

    // One junction per prerequisite, so a node's outgoing edges branch from a
    // single point rather than each turning at its own offset.
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
      size: {
        width: (Math.max(...xs) - minX) * SCALE_X + PAD * 2,
        height: (Math.max(...ys) - minY) * SCALE_Y + PAD * 2 + LABEL_BLOCK,
      },
      crossbars,
      recommendedId: nextQuests(tree, masteredIds, 1)[0]?.id ?? null,
      openedIds: new Set(
        before
          ? tree.nodes
              .filter((n) => status.get(n.id) === 'available' && before.get(n.id) === 'locked')
              .map((n) => n.id)
          : [],
      ),
    };
  }, [tree, masteredIds, recentlyMasteredId]);

  const wipe = useWipe(recentlyMasteredId, !reduceMotion);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);

  return (
    <ScrollView
      style={styles.chart}
      contentContainerStyle={styles.canvas}
      showsVerticalScrollIndicator={false}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={size.width} height={size.height}>
          <DitherDefs name="lock" colour={palette.wine} levels={[6]} />

          {tree.prereqs.map(({ nodeId, prereqId }) => {
            const a = byId.get(prereqId);
            const b = byId.get(nodeId);
            if (!a || !b) return null;

            const walked = status.get(prereqId) === 'mastered';
            const ink = walked ? palette.brass : palette.slate;
            const points = edgeWaypoints(
              { x: a.px, y: a.py },
              { x: b.px, y: b.py },
              CHART_ROUTING,
              crossbars.get(prereqId),
            );
            // An edge leaving the node just completed draws itself in.
            const drawing = prereqId === recentlyMasteredId ? wipe : 1;

            return (
              <G key={`${prereqId}->${nodeId}`} opacity={walked ? 1 : 0.65}>
                <Path
                  d={orthogonalPath(points)}
                  fill="none"
                  stroke={ink}
                  strokeWidth={walked ? 3 : 2}
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

          {nodes.map((node) => (
            <NodeCell
              key={node.id}
              node={node}
              status={status.get(node.id) ?? 'locked'}
              selected={node.id === selectedId}
              recommended={node.id === recommendedId}
              wipe={openedIds.has(node.id) ? wipe : 1}
              flat={Boolean(lowBandwidth)}
              onPress={() => onSelectNode(node)}
            />
          ))}
        </Svg>
      </ScrollView>
    </ScrollView>
  );
}

function NodeCell({
  node,
  status,
  selected,
  recommended,
  wipe,
  flat,
  onPress,
}: {
  node: Placed;
  status: NodeStatus;
  selected: boolean;
  recommended: boolean;
  wipe: number;
  flat: boolean;
  onPress: () => void;
}) {
  const s = nodeStyle[status];
  const x = node.px - HALF;
  const y = node.py - HALF;

  const label = `${node.title}. ${s.label}. Worth ${node.xpReward} XP.${
    recommended ? ' Recommended next.' : ''
  }`;

  // A tappable <G>, not a Pressable: anything react-native-web resolves to an
  // HTML tag is emitted inside <svg>, where the browser drops the subtree.
  //
  // Same reason the role is native-only: react-native-web rewrites an element's
  // tag whenever its role maps to HTML, so accessibilityRole="button" here
  // renders a <button> in the SVG namespace and the node disappears. On web the
  // mark is a labelled <g> — announced by name, but not reachable by keyboard.
  // Fixing that properly means a real focusable control outside the SVG.
  const a11y: Pick<
    AccessibilityProps,
    'accessibilityLabel' | 'accessibilityRole' | 'accessibilityState'
  > =
    Platform.OS === 'web'
      ? { accessibilityLabel: label }
      : {
          accessibilityLabel: label,
          accessibilityRole: 'button',
          accessibilityState: { disabled: status === 'locked', selected },
        };

  return (
    <G
      onPress={() => {
        onPress();
        if (status === 'locked') {
          AccessibilityInfo.announceForAccessibility(
            `${node.title} is locked. Finish its prerequisites first.`,
          );
        }
      }}
      {...a11y}
    >
      {/* The recommended next node wears the only blush mark on the screen. */}
      {recommended ? (
        <Rect
          x={x - 6}
          y={y - 6}
          width={CELL + 12}
          height={CELL + 12}
          fill="none"
          stroke={palette.blush}
          strokeWidth={2}
        />
      ) : null}

      <G opacity={wipe < 1 ? 0.35 + wipe * 0.65 : 1}>
        {/* A locked cell is dithered rather than tinted: half density is how
            this screen says "not yet" without a seventeenth colour. */}
        <Rect
          x={x}
          y={y}
          width={CELL}
          height={CELL * (wipe < 1 ? wipe : 1)}
          fill={status === 'locked' && !flat ? ditherFill('lock', 6) : s.fill}
        />
        {status === 'locked' ? (
          <Rect
            x={x}
            y={y}
            width={CELL}
            height={CELL}
            fill="none"
            stroke={s.edge}
            strokeWidth={2}
          />
        ) : (
          <>
            {/* Bevel: lit along the top-left, dark along the bottom-right. */}
            <Path
              d={`M${x},${y + CELL} L${x},${y} L${x + CELL},${y} L${x + CELL - 3},${y + 3} L${x + 3},${y + 3} L${x + 3},${y + CELL - 3} Z`}
              fill={s.light}
            />
            <Path
              d={`M${x + CELL},${y} L${x + CELL},${y + CELL} L${x},${y + CELL} L${x + 3},${y + CELL - 3} L${x + CELL - 3},${y + CELL - 3} L${x + CELL - 3},${y + 3} Z`}
              fill={s.dark}
            />
          </>
        )}

        {selected ? (
          <Rect
            x={x - 2}
            y={y - 2}
            width={CELL + 4}
            height={CELL + 4}
            fill="none"
            stroke={palette.bone}
            strokeWidth={2}
          />
        ) : null}

        <Glyph kind={s.glyph} x={node.px} y={node.py} colour={s.ink} />
      </G>

      {wrapTitle(node.title).map((line, i) => (
        <SvgText
          key={i}
          x={node.px}
          y={y + CELL + 18 + i * 16}
          /* Every label is bone, locked included: `haze` on the cardinal field
             measures 3.3:1 and the floor is 4.5:1. Status is already carried by
             the dithered cell and the lock glyph, so dimming the text bought
             nothing and cost legibility. */
          fill={palette.bone}
          fontSize={13}
          fontFamily={font.screen}
          textAnchor="middle"
        >
          {line}
        </SvgText>
      ))}
    </G>
  );
}

/**
 * Status glyphs, drawn on the same 8×8 grid as the icon set, so a check on the
 * chart is the same object as a check in a list.
 */
function Glyph({ kind, x, y, colour }: { kind: string; x: number; y: number; colour: string }) {
  const u = 2.4; // one grid cell, in dp
  const at = (gx: number, gy: number, w = 1, h = 1) => (
    <Rect
      key={`${gx}-${gy}-${w}-${h}`}
      x={x + (gx - 4) * u}
      y={y + (gy - 4) * u}
      width={w * u}
      height={h * u}
      fill={colour}
    />
  );

  if (kind === 'check') {
    return (
      <G>
        {at(1, 4)}
        {at(2, 5)}
        {at(3, 6)}
        {at(4, 5)}
        {at(5, 4)}
        {at(6, 3)}
        {at(7, 2)}
        {at(2, 4)}
        {at(3, 5)}
        {at(4, 4)}
        {at(5, 3)}
        {at(6, 2)}
      </G>
    );
  }
  if (kind === 'play') {
    return (
      <G>
        {at(3, 1, 1, 6)}
        {at(4, 2, 1, 4)}
        {at(5, 3, 1, 2)}
      </G>
    );
  }
  return (
    <G>
      {at(3, 1, 2, 1)}
      {at(2, 2, 1, 2)}
      {at(5, 2, 1, 2)}
      {at(1, 4, 6, 3)}
    </G>
  );
}

/** Two lines, because a chart of one-line labels is a chart of truncations. */
function wrapTitle(title: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of title.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > 14 && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 2 ? [lines[0]!, `${lines[1]!.slice(0, 12)}…`] : lines;
}

const styles = StyleSheet.create({
  chart: { flex: 1 },
  canvas: { padding: space.xs },
});
