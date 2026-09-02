import assert from 'node:assert/strict';
import { test } from 'node:test';

// Explicit .ts extension: `node --test` strips types but does not resolve
// extensionless specifiers the way Metro does.
import {
  arrowheadPoints,
  bendsOf,
  crossbarByPrereq,
  crossbarByTarget,
  edgeWaypoints,
  orthogonalPath,
  waypointFractions,
  type RoutedEdge,
  type RoutedNode,
  type Routing,
} from './edgeRouting.ts';

const VERTICAL: Routing = { axis: 'vertical', in: 46, out: 90, elbowMin: 12, arrow: 11 };
const HORIZONTAL: Routing = { axis: 'horizontal', in: 16, out: 40, elbowMin: 5, arrow: 7 };

/** No segment may be diagonal — that is the whole point of the router. */
function assertSquare(points: ReturnType<typeof edgeWaypoints>, label: string) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const straight = Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9;
    assert.ok(straight, `${label}: segment ${i} is diagonal (${a.x},${a.y} → ${b.x},${b.y})`);
  }
}

test('every segment is axis-aligned, on both axes and in every direction', () => {
  const targets = [
    { x: 0, y: 400 }, // straight ahead
    { x: 300, y: 400 }, // ahead and across
    { x: -300, y: 400 }, // ahead and back across
    { x: 300, y: 0 }, // level with the source
    { x: 300, y: -400 }, // behind the source
    { x: 0.4, y: 400 }, // near-enough same lane
    { x: 10, y: 400 }, // a jog too narrow to turn in
  ];

  for (const routing of [VERTICAL, HORIZONTAL]) {
    for (const target of targets) {
      const points = edgeWaypoints({ x: 0, y: 0 }, target, routing);
      assertSquare(points, `${routing.axis} → ${target.x},${target.y}`);
      assert.ok(points.length === 2 || points.length === 4);
    }
  }
});

test('siblings share one junction, and it lies on both their paths', () => {
  const nodes: RoutedNode[] = [
    { id: 'root', x: 100, y: 0 },
    { id: 'left', x: 0, y: 400 },
    { id: 'right', x: 260, y: 400 },
  ];
  const edges: RoutedEdge[] = [
    { from: 'root', to: 'left' },
    { from: 'root', to: 'right' },
  ];

  const bars = crossbarByPrereq(nodes, edges, VERTICAL);
  const bar = bars.get('root');
  assert.ok(bar !== undefined, 'the prerequisite got a crossbar');

  const left = edgeWaypoints(nodes[0]!, nodes[1]!, VERTICAL, bar);
  const right = edgeWaypoints(nodes[0]!, nodes[2]!, VERTICAL, bar);

  // The junction is the first bend of both edges, at the same point.
  assert.deepEqual(bendsOf(left)[0], bendsOf(right)[0]);
  assert.deepEqual(bendsOf(left)[0], { x: 100, y: bar });

  // And it clears both the mark it left and the marks it feeds.
  assert.ok(bar! >= 0 + VERTICAL.out + VERTICAL.elbowMin);
  assert.ok(bar! <= 400 - VERTICAL.in - VERTICAL.elbowMin);
});

test('a horizontal chart routes across x, not y', () => {
  const nodes: RoutedNode[] = [
    { id: 'a', x: 0, y: 65 },
    { id: 'b', x: 150, y: 0 },
    { id: 'c', x: 150, y: 130 },
  ];
  const edges: RoutedEdge[] = [
    { from: 'a', to: 'b' },
    { from: 'a', to: 'c' },
  ];

  const bar = crossbarByPrereq(nodes, edges, HORIZONTAL).get('a')!;
  const up = edgeWaypoints(nodes[0]!, nodes[1]!, HORIZONTAL, bar);
  const down = edgeWaypoints(nodes[0]!, nodes[2]!, HORIZONTAL, bar);

  assertSquare(up, 'horizontal up');
  assertSquare(down, 'horizontal down');
  // The shared junction sits at a shared x, on the source's own row.
  assert.deepEqual(bendsOf(up)[0], { x: bar, y: 65 });
  assert.deepEqual(bendsOf(down)[0], { x: bar, y: 65 });
  assert.ok(bar > 0 && bar < 150, 'the bar sits between the two ranks');
});

test('a narrow elbow is marked once, and never leaves two dots touching', () => {
  for (const routing of [VERTICAL, HORIZONTAL]) {
    const minGap = 2 * routing.elbowMin;
    const source = { x: 0, y: 0 };
    // A jog half the minimum gap: too narrow for two dots, wide enough to turn.
    const target = routing.axis === 'vertical' ? { x: routing.elbowMin, y: 400 } : { x: 400, y: routing.elbowMin };

    const points = edgeWaypoints(source, target, routing);
    const dots = bendsOf(points, minGap);
    assert.equal(points.length, 4, `${routing.axis}: the corners are still there`);
    assert.equal(dots.length, 1, `${routing.axis}: but only one is marked`);
    // The kept dot is the junction the node's other edges branch from.
    assert.deepEqual(dots[0], points[1]);

    // Keeping the corners means the arrowhead still lands centred on the mark.
    const tip = points[3]!;
    assert.equal(routing.axis === 'vertical' ? tip.x : tip.y, routing.elbowMin);
  }

  // Wide enough to read as two turns, and both get marked.
  const wide = edgeWaypoints({ x: 0, y: 0 }, { x: 300, y: 400 }, VERTICAL);
  const wideDots = bendsOf(wide, 2 * VERTICAL.elbowMin);
  assert.equal(wideDots.length, 2);
  assert.ok(
    Math.hypot(wideDots[0]!.x - wideDots[1]!.x, wideDots[0]!.y - wideDots[1]!.y) >= 2 * VERTICAL.elbowMin,
  );
});

test('separate prerequisites never reuse one crossbar lane', () => {
  // Two parents side by side, each over its own children, meeting at one shared
  // child. Their trunks remain distinct even though their spans only touch.
  const tidy: RoutedNode[] = [
    { id: 'p1', x: 0, y: 0 },
    { id: 'p2', x: 600, y: 0 },
    { id: 'a', x: -200, y: 400 },
    { id: 'shared', x: 300, y: 400 },
    { id: 'b', x: 800, y: 400 },
  ];
  const tidyBars = crossbarByPrereq(
    tidy,
    [
      { from: 'p1', to: 'a' },
      { from: 'p1', to: 'shared' },
      { from: 'p2', to: 'shared' },
      { from: 'p2', to: 'b' },
    ],
    VERTICAL,
  );
  assert.notEqual(tidyBars.get('p1'), tidyBars.get('p2'), 'separate prerequisites get separate trunks');

  // Now p2 also reaches back past p1's children, so the two bars really do
  // overlap and have to be pulled apart.
  const crossed = crossbarByPrereq(
    tidy,
    [
      { from: 'p1', to: 'shared' },
      { from: 'p2', to: 'a' },
      { from: 'p2', to: 'b' },
    ],
    VERTICAL,
  );
  assert.notEqual(crossed.get('p1'), crossed.get('p2'), 'crossing prerequisites remain separate too');

  // However they land, every bar clears the marks above and — crucially — stops
  // short of the arrowheads below, so no turn dot ends up sitting on one.
  for (const bars of [tidyBars, crossed]) {
    for (const bar of bars.values()) {
      assert.ok(bar >= 0 + VERTICAL.out, 'bar clears the mark it leaves');
      assert.ok(
        bar <= 400 - VERTICAL.in - (VERTICAL.arrow ?? VERTICAL.elbowMin),
        `bar clears the arrowhead it feeds, got ${bar}`,
      );
    }
  }
});

test('multiple prerequisites share one semantic convergence before the target', () => {
  const nodes: RoutedNode[] = [
    { id: 'upper', x: 0, y: 0 },
    { id: 'lower', x: 0, y: 200 },
    { id: 'target', x: 400, y: 100 },
  ];
  const edges: RoutedEdge[] = [
    { from: 'lower', to: 'target' },
    { from: 'upper', to: 'target' },
  ];
  const bar = crossbarByTarget(nodes, edges, HORIZONTAL).get('target');
  assert.ok(bar !== undefined);

  const upper = edgeWaypoints(nodes[0]!, nodes[2]!, HORIZONTAL, bar, true);
  const lower = edgeWaypoints(nodes[1]!, nodes[2]!, HORIZONTAL, bar, true);
  assert.deepEqual(upper.slice(-2), lower.slice(-2), 'both branches share one final arrival');
  assert.notDeepEqual(upper.slice(0, -1), lower.slice(0, -1), 'the prerequisite branches stay distinct');
});

test('a path with no children still gets a usable route', () => {
  const bars = crossbarByPrereq([{ id: 'lonely', x: 0, y: 0 }], [], VERTICAL);
  assert.equal(bars.size, 0);
  const points = edgeWaypoints({ x: 0, y: 0 }, { x: 200, y: 400 }, VERTICAL, bars.get('lonely'));
  assertSquare(points, 'no crossbar');
});

test('waypoint fractions run 0 to 1 in step with the drawn length', () => {
  // 34.5 down, 200 across, 60 down — total 294.5.
  const points = [
    { x: 0, y: 0 },
    { x: 0, y: 34.5 },
    { x: 200, y: 34.5 },
    { x: 200, y: 94.5 },
  ];
  const fractions = waypointFractions(points);

  assert.equal(fractions.length, points.length);
  assert.equal(fractions[0], 0, 'the start is nothing earned');
  assert.equal(fractions[fractions.length - 1], 1, 'the end is all of it');
  for (let i = 1; i < fractions.length; i++) {
    assert.ok(fractions[i]! > fractions[i - 1]!, 'fractions only ever go forward');
  }
  assert.ok(Math.abs(fractions[1]! - 34.5 / 294.5) < 1e-9);
  assert.ok(Math.abs(fractions[2]! - 234.5 / 294.5) < 1e-9);

  // A degenerate run has no length to divide by and must not produce NaN.
  const still = waypointFractions([{ x: 5, y: 5 }, { x: 5, y: 5 }]);
  assert.ok(still.every(Number.isFinite), `got ${still}`);
});

test('the drawn path and arrowhead follow the waypoints', () => {
  const points = edgeWaypoints({ x: 0, y: 0 }, { x: 200, y: 400 }, VERTICAL);
  assert.equal(orthogonalPath(points), `M 0 90 L 0 222 L 200 222 L 200 354`);

  // Final segment runs downward, so the arrow points down: tip lowest, base above.
  const arrow = arrowheadPoints(points, 10).split(' ').map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    return { x: x!, y: y! };
  });
  assert.deepEqual(arrow[0], { x: 200, y: 354 });
  assert.ok(arrow[1]!.y < 354 && arrow[2]!.y < 354, 'the base sits behind the tip');
  assert.ok(Math.abs(arrow[1]!.x - arrow[2]!.x) > 0, 'the base has width');
});
