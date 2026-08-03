import { useMemo } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { nodeStyle, palette, space, type } from '@/theme/tokens';
import { deriveStatuses, nextQuests } from './progression';
import type { NodeStatus, SkillNode, Tree } from './types';

const NODE_R = 14;

interface Props {
  tree: Tree;
  masteredIds: string[];
  onSelectNode: (node: SkillNode) => void;
  /** Pass the value of `useReducedMotion()`; suppresses the meridian's draw-in. */
  reduceMotion?: boolean;
}

/**
 * The chart. Nodes are plotted at the coordinates assigned when the tree was
 * generated; edges are hairlines; the single cardinal-red line — the meridian —
 * runs from the student's furthest mastered node to their next available one.
 *
 * ponytail: static viewBox, no pan or zoom yet. Trees from a one-semester
 * syllabus fit on a phone screen. Add a gesture-driven transform when a real
 * syllabus produces a chart that doesn't.
 */
export function SkillTree({ tree, masteredIds, onSelectNode, reduceMotion }: Props) {
  const { status, bounds, meridian } = useMemo(() => {
    const { status } = deriveStatuses(tree, masteredIds);

    const xs = tree.nodes.map((n) => n.x);
    const ys = tree.nodes.map((n) => n.y);
    const pad = NODE_R * 4;
    const bounds = {
      minX: Math.min(...xs) - pad,
      minY: Math.min(...ys) - pad,
      width: Math.max(...xs) - Math.min(...xs) + pad * 2,
      height: Math.max(...ys) - Math.min(...ys) + pad * 2,
    };

    // Furthest mastered node → the recommended next quest.
    const mastered = tree.nodes.filter((n) => status.get(n.id) === 'mastered');
    const from = mastered.length > 0 ? mastered[mastered.length - 1]! : undefined;
    const to = nextQuests(tree, masteredIds, 1)[0];
    const meridian = from && to ? { from, to } : undefined;

    return { status, bounds, meridian };
  }, [tree, masteredIds]);

  return (
    <View style={styles.chart}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      >
        {tree.prereqs.map(({ nodeId, prereqId }) => {
          const a = tree.nodes.find((n) => n.id === prereqId);
          const b = tree.nodes.find((n) => n.id === nodeId);
          if (!a || !b) return null;
          const walked = status.get(prereqId) === 'mastered';
          return (
            <Line
              key={`${prereqId}->${nodeId}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={walked ? palette.brass : palette.slate}
              strokeWidth={walked ? 1.5 : 1}
              opacity={walked ? 0.8 : 0.45}
            />
          );
        })}

        {meridian ? (
          <Line
            x1={meridian.from.x}
            y1={meridian.from.y}
            x2={meridian.to.x}
            y2={meridian.to.y}
            stroke={palette.cardinal}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={reduceMotion ? undefined : '6 5'}
          />
        ) : null}

        {tree.nodes.map((node) => (
          <NodeMark
            key={node.id}
            node={node}
            status={status.get(node.id) ?? 'locked'}
            onPress={() => onSelectNode(node)}
          />
        ))}
      </Svg>
    </View>
  );
}

function NodeMark({
  node,
  status,
  onPress,
}: {
  node: SkillNode;
  status: NodeStatus;
  onPress: () => void;
}) {
  const style = nodeStyle[status];
  const label = `${node.title}. ${style.label}. Worth ${node.xpReward} XP.`;

  return (
    <Pressable
      onPress={() => {
        onPress();
        if (status === 'locked') {
          AccessibilityInfo.announceForAccessibility(
            `${node.title} is locked. Finish its prerequisites first.`,
          );
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: status === 'locked' }}
    >
      {style.sides === 0 ? (
        <Circle cx={node.x} cy={node.y} r={NODE_R} fill={style.fill} stroke={style.stroke} strokeWidth={2} />
      ) : (
        <Polygon
          points={regularPolygon(node.x, node.y, NODE_R, style.sides)}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={2}
        />
      )}
      <SvgText
        x={node.x}
        y={node.y + NODE_R + 16}
        fill={status === 'locked' ? palette.haze : palette.parchment}
        fontSize={12}
        fontFamily={type.caption.fontFamily}
        textAnchor="middle"
      >
        {node.title}
      </SvgText>
    </Pressable>
  );
}

/** `sides`-gon centred on (cx, cy), first vertex pointing up. */
function regularPolygon(cx: number, cy: number, r: number, sides: number): string {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

const styles = StyleSheet.create({
  chart: { flex: 1, backgroundColor: palette.ink, padding: space.md },
});
