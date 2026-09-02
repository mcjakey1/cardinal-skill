/**
 * Where the chart's edges go.
 *
 * Both charts draw the same kind of line — square corners, one junction per
 * prerequisite, a dot on every turn — but the web chart ranks top-to-bottom and
 * the native one left-to-right. The maths is written once for the vertical case
 * and the horizontal case is the same problem transposed, so a change to how an
 * edge bends reaches both platforms at once.
 *
 * Node marks differ too: a diamond with two lines of caption under it on web, a
 * small polygon with one label on native. That is what `Routing` carries — the
 * shape of the route is shared, the distances into and out of a mark are not.
 */

export interface Point {
  x: number;
  y: number;
}

export interface RoutedNode extends Point {
  id: string;
}

export interface RoutedEdge {
  /** The prerequisite the edge leaves. */
  from: string;
  /** The node it unlocks. */
  to: string;
}

export interface Routing {
  /** 'vertical' ranks downward; 'horizontal' ranks rightward. */
  axis: 'vertical' | 'horizontal';
  /** How far before a mark an arriving edge stops. Leave room for the arrowhead. */
  in: number;
  /** How far past a mark a leaving edge starts. Must clear the mark's captions. */
  out: number;
  /** Shortest leg a turn is allowed, so a corner never collapses onto its dot. */
  elbowMin: number;
  /**
   * Length of the arrowhead. A crossbar is never allowed to land inside one,
   * or the turn dot ends up sitting on the arrow's tail. Defaults to `elbowMin`
   * for a chart that draws its own arrows at some other size.
   */
  arrow?: number;
}

/** Clearance an edge's last leg needs: the arrowhead, plus a turn's worth. */
const tailRoom = (routing: Routing) => (routing.arrow ?? routing.elbowMin) + routing.elbowMin;

const transpose = (p: Point): Point => ({ x: p.y, y: p.x });

function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), Math.max(high, low));
}

/**
 * One crossbar per prerequisite, in the along-rank coordinate: a `y` on a
 * vertical chart, an `x` on a horizontal one. Every edge leaving a node uses its
 * node's bar, so siblings branch from a single junction instead of each turning
 * at its own offset.
 *
 * Every prerequisite on one rank gets its own lane. Reusing a lane for separate
 * parents makes unrelated edges look joined and lets one edge's progress colour
 * overwrite another. Sibling edges from the same prerequisite still share one
 * intentional junction.
 *
 * Pass the result to `edgeWaypoints` unchanged — the two agree on the axis.
 */
export function crossbarByPrereq(
  nodes: RoutedNode[],
  edges: RoutedEdge[],
  routing: Routing,
): Map<string, number> {
  const flat = routing.axis === 'horizontal';
  const at = (n: RoutedNode) => (flat ? transpose(n) : n);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const children = new Map<string, Point[]>();
  for (const { from, to } of edges) {
    const source = byId.get(from);
    const target = byId.get(to);
    if (!source || !target) continue;
    children.set(from, [...(children.get(from) ?? []), at(target)]);
  }

  const ranks = new Map<number, string[]>();
  for (const id of children.keys()) {
    // Rounded so a layout that places a rank a pixel apart still groups it.
    const rank = Math.round(at(byId.get(id)!).y / 10) * 10;
    ranks.set(rank, [...(ranks.get(rank) ?? []), id]);
  }

  const bars = new Map<string, number>();
  for (const ids of ranks.values()) {
    // The corridor every bar on this rank has to fit inside: past the last mark
    // that has to be cleared, before the first child that has to be reached.
    let corridorStart = -Infinity;
    let corridorEnd = Infinity;
    for (const id of ids) {
      const source = at(byId.get(id)!);
      const kids = children.get(id)!;
      const start = source.y + routing.out;
      // Only children that actually sit further along set the bar. A help step
      // hanging beside its parent would otherwise pull the bar back past it.
      const ahead = kids
        .map((kid) => kid.y - routing.in)
        .filter((top) => top > start + 2 * routing.elbowMin);
      const end = ahead.length > 0 ? Math.min(...ahead) : start + routing.out;
      corridorStart = Math.max(corridorStart, start);
      corridorEnd = Math.min(corridorEnd, end);
    }

    const ordered = [...ids].sort((left, right) => {
      const a = at(byId.get(left)!);
      const b = at(byId.get(right)!);
      return a.x - b.x || left.localeCompare(right);
    });

    // A rank whose marks and children leave no room between them: put each bar
    // just past its own mark, staggered so unrelated trunks never coincide.
    if (corridorEnd <= corridorStart) {
      for (const [index, id] of ordered.entries()) {
        bars.set(id, corridorStart + routing.elbowMin * (index + 1));
      }
      continue;
    }

    // The band the bars may occupy. Its far edge stops short of the arrowheads:
    // a bar that lands inside one puts the turn dot on the arrow's tail, which
    // reads as a smudge rather than as a turn and an arrival.
    const low = corridorStart + routing.elbowMin;
    const high = Math.max(corridorEnd - tailRoom(routing), low);
    const lanes = ordered.length;
    const gap = lanes > 1 ? (high - low) / (lanes - 1) : 0;

    for (const [index, id] of ordered.entries()) {
      // A rank needing one bar centres it; several spread across the whole band.
      const bar = lanes === 1 ? corridorStart + (corridorEnd - corridorStart) / 2 : low + index * gap;
      bars.set(id, clamp(bar, low, high));
    }
  }

  return bars;
}

/**
 * The corners an edge turns: out of the prerequisite to its crossbar, along the
 * bar, then into the node it unlocks. Corner points rather than a path string,
 * because the chart draws a dot on each turn and the turns have to stay
 * addressable.
 */
export function edgeWaypoints(
  source: Point,
  target: Point,
  routing: Routing,
  crossbar?: number,
  forceCrossbar = false,
): Point[] {
  const flat = routing.axis === 'horizontal';
  const a = flat ? transpose(source) : source;
  const b = flat ? transpose(target) : target;

  const x1 = a.x;
  const y1 = a.y + routing.out;
  const x2 = b.x;
  const y2 = b.y - routing.in;

  const points =
    // Near enough the same lane: one straight run, no corners at all.
    //
    // Both ends snap to the source's lane — an elbow a pixel wide reads as a
    // kink, and a run that drifts a pixel across is a diagonal, which is the
    // one thing this router promises never to draw. A wider-but-still-narrow
    // jog keeps its corners, so the arrowhead stays centred on the mark it
    // points at; `bendsOf` is what stops those corners being marked twice.
    Math.abs(x2 - x1) < 1.5 && !forceCrossbar
      ? [
          { x: x1, y: y1 },
          { x: x1, y: y2 },
        ]
      : (() => {
          const span = y2 - y1;
          const bar = crossbar ?? (span > 0 ? y1 + span / 2 : y1 + routing.out);
          return [
            { x: x1, y: y1 },
            { x: x1, y: bar },
            { x: x2, y: bar },
            { x: x2, y: y2 },
          ];
        })();

  return flat ? points.map(transpose) : points;
}

/**
 * One convergence bar per node with multiple prerequisites. Parent branches
 * meet there, then one shared arrival enters the dependent node. Sharing is
 * therefore semantic: the lines have the same destination, not merely the same
 * empty lane on the canvas.
 */
export function crossbarByTarget(
  nodes: RoutedNode[],
  edges: RoutedEdge[],
  routing: Routing,
): Map<string, number> {
  const flat = routing.axis === 'horizontal';
  const at = (node: RoutedNode) => (flat ? transpose(node) : node);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parents = new Map<string, RoutedNode[]>();

  for (const edge of edges) {
    const source = byId.get(edge.from);
    const target = byId.get(edge.to);
    if (!source || !target) continue;
    parents.set(edge.to, [...(parents.get(edge.to) ?? []), source]);
  }

  const bars = new Map<string, number>();
  for (const [targetId, sources] of parents) {
    if (new Set(sources.map((source) => source.id)).size < 2) continue;
    const target = at(byId.get(targetId)!);
    const corridorStart = Math.max(...sources.map((source) => at(source).y + routing.out));
    const corridorEnd = target.y - routing.in;
    const low = corridorStart + routing.elbowMin;
    const high = corridorEnd - tailRoom(routing);
    bars.set(targetId, high >= low ? high : corridorStart + (corridorEnd - corridorStart) / 2);
  }

  return bars;
}

/**
 * The waypoints as one polyline. Corners stay square: every segment is either
 * vertical or horizontal, so each turn is a true right angle and the line passes
 * exactly through the dot drawn on it.
 */
export function orthogonalPath(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/**
 * The turns worth marking: every corner, never the two ends.
 *
 * `minGap` drops a corner that sits too close to the one before it. Two nodes
 * nearly in the same lane make an elbow only a few units wide, and a dot on
 * each end of it is two dots overlapping into a blob. Keeping the first — the
 * junction the node's other edges also branch from — and dropping the second
 * leaves one dot on a small, legible step.
 */
export function bendsOf(points: Point[], minGap = 0): Point[] {
  const kept: Point[] = [];
  for (const corner of points.slice(1, -1)) {
    const previous = kept[kept.length - 1];
    if (previous && Math.hypot(corner.x - previous.x, corner.y - previous.y) < minGap) continue;
    kept.push(corner);
  }
  return kept;
}

/**
 * How far along the whole run each waypoint sits, 0–1.
 *
 * An edge doubles as a progress bar for the node it runs into, so every mark on
 * it — the turn dots, the arrowhead — has to know whether the filled part has
 * reached it yet. Index-for-index with `points`.
 */
export function waypointFractions(points: Point[]): number[] {
  const legs = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  const total = legs.reduce((sum, leg) => sum + leg, 0) || 1;
  let run = 0;
  return points.map((_, i) => {
    if (i > 0) run += legs[i - 1]!;
    return run / total;
  });
}

/**
 * An arrowhead as an SVG polygon `points` string, tip on the target port and
 * aimed along the edge's final segment.
 *
 * Drawn rather than declared as an SVG `<marker>`: react-native-svg's marker
 * support does not hold up across iOS, Android, and web, and on web a stray
 * `fill` rule reaches inside `<marker>` and paints the arrow out of existence.
 */
export function arrowheadPoints(points: Point[], size: number): string {
  const tip = points[points.length - 1]!;
  const prev = points[points.length - 2] ?? tip;
  const length = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
  const ux = (tip.x - prev.x) / length;
  const uy = (tip.y - prev.y) / length;
  const baseX = tip.x - ux * size;
  const baseY = tip.y - uy * size;
  const halfWidth = size * 0.42;

  return [
    `${tip.x},${tip.y}`,
    `${baseX - uy * halfWidth},${baseY + ux * halfWidth}`,
    `${baseX + uy * halfWidth},${baseY - ux * halfWidth}`,
  ].join(' ');
}
