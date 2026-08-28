import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MIN_COHORT } from './cohort.ts';
import {
  bottlenecks,
  classSpread,
  clearedUpperBounds,
  studentsToWatch,
  type Bottleneck,
  type GraphEdge,
  type GraphNode,
  type ProgressRow,
} from './classInsights.ts';

const NOW = new Date('2026-03-01T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function student(over: Partial<ProgressRow> & { userId: string }): ProgressRow {
  return {
    displayName: over.userId.toUpperCase(),
    mastered: 4,
    gradedNodes: 8,
    progress: 50,
    lastActive: daysAgo(1),
    ...over,
  };
}

/** n students, evenly spaced across the whole range, all active. */
function evenClass(n: number): ProgressRow[] {
  return Array.from({ length: n }, (_, i) =>
    student({
      userId: `s${i}`,
      progress: Math.round((i / (n - 1)) * 100),
      mastered: i === 0 ? 1 : i,
    }),
  );
}

// ------------------------------------------------------------- classSpread

test('classSpread hides everything below the five-student floor', () => {
  for (let n = 0; n < MIN_COHORT; n += 1) {
    const result = classSpread(evenClass(Math.max(n, 2)).slice(0, n));
    assert.equal(result.suppressed, true, `n=${n} should be suppressed`);
    if (result.suppressed) {
      assert.equal(result.size, n);
      assert.match(result.reason, /hidden below 5/);
    }
  }
});

test('classSpread on an empty roster is suppressed, not a divide by zero', () => {
  const result = classSpread([]);
  assert.equal(result.suppressed, true);
  if (result.suppressed) assert.equal(result.size, 0);
});

test('classSpread reports quartiles and bands that add up to the class', () => {
  // 0, 25, 50, 75, 100
  const result = classSpread(evenClass(5));
  assert.equal(result.suppressed, false);
  if (result.suppressed) return;

  assert.equal(result.size, 5);
  assert.equal(result.median, 50);
  assert.equal(result.lower, 25);
  assert.equal(result.upper, 75);

  const total = result.bands.reduce((sum, b) => sum + b.count, 0);
  assert.equal(total, 5, 'every student lands in exactly one band');
  assert.deepEqual(
    result.bands.map((b) => [b.key, b.count]),
    [
      ['none', 1],
      ['early', 0],
      ['partway', 2],
      ['most', 1],
      ['done', 1],
    ],
  );
});

test('classSpread names a class that has pulled apart', () => {
  const rows = [
    ...Array.from({ length: 5 }, (_, i) => student({ userId: `low${i}`, progress: 0, mastered: 0 })),
    ...Array.from({ length: 5 }, (_, i) => student({ userId: `high${i}`, progress: 100 })),
  ];
  const result = classSpread(rows);
  if (result.suppressed) return assert.fail('should not be suppressed');
  assert.equal(result.split, true);
  // The mean of this class is a comfortable 50 and says nothing. The median is
  // equally useless here; the bands are the whole point.
  assert.equal(result.bands.find((b) => b.key === 'partway')!.count, 0);
});

test('classSpread does not call an evenly spread class split', () => {
  const result = classSpread(evenClass(12));
  if (result.suppressed) return assert.fail('should not be suppressed');
  assert.equal(result.split, false);
});

test('classSpread clamps a progress figure the database should never produce', () => {
  const rows = [
    student({ userId: 'a', progress: -20 }),
    student({ userId: 'b', progress: 140 }),
    student({ userId: 'c', progress: Number.NaN }),
    student({ userId: 'd', progress: 50 }),
    student({ userId: 'e', progress: 50 }),
  ];
  const result = classSpread(rows);
  if (result.suppressed) return assert.fail('should not be suppressed');
  assert.equal(result.bands.find((b) => b.key === 'done')!.count, 1);
  assert.equal(result.bands.find((b) => b.key === 'none')!.count, 2);
  assert.ok(result.median >= 0 && result.median <= 100);
});

// --------------------------------------------------------- studentsToWatch

test('studentsToWatch flags nobody in a class that is all moving', () => {
  const list = studentsToWatch(evenClass(8).slice(1), NOW);
  assert.deepEqual(list.rows, []);
  assert.equal(list.rankingSuppressed, false);
});

test('studentsToWatch flags a student who has cleared nothing, even with no timestamp', () => {
  const list = studentsToWatch([student({ userId: 'a', mastered: 0, progress: 0, lastActive: null })], NOW);
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0]!.reason, 'not-started');
  assert.equal(list.rows[0]!.daysIdle, null);
});

test('studentsToWatch flags a student who was moving and stopped', () => {
  const list = studentsToWatch([student({ userId: 'a', lastActive: daysAgo(20) })], NOW);
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0]!.reason, 'idle');
  assert.equal(list.rows[0]!.daysIdle, 20);
});

test('studentsToWatch leaves a student inside the stale window alone', () => {
  const list = studentsToWatch([student({ userId: 'a', lastActive: daysAgo(13) })], NOW);
  assert.deepEqual(list.rows, []);
});

test('studentsToWatch withholds the ranking below the floor but still flags', () => {
  const rows = [
    student({ userId: 'a', mastered: 0, progress: 0, lastActive: null }),
    student({ userId: 'b', progress: 90 }),
  ];
  const list = studentsToWatch(rows, NOW);
  assert.equal(list.rankingSuppressed, true);
  assert.equal(list.lowerQuartile, null);
  assert.equal(list.rows.length, 1, 'the absolute flag does not need a class to compare against');
  assert.equal(list.rows[0]!.alsoBehind, null);
});

test('studentsToWatch annotates an idle student who is also in the slowest quarter', () => {
  const rows = [
    student({ userId: 'slow', progress: 5, lastActive: daysAgo(30) }),
    student({ userId: 'fast', progress: 95, lastActive: daysAgo(30) }),
    student({ userId: 'c', progress: 60 }),
    student({ userId: 'd', progress: 70 }),
    student({ userId: 'e', progress: 80 }),
    student({ userId: 'f', progress: 90 }),
  ];
  const list = studentsToWatch(rows, NOW);
  assert.equal(list.rankingSuppressed, false);
  const byId = new Map(list.rows.map((r) => [r.userId, r]));
  assert.equal(byId.get('slow')!.alsoBehind, true);
  assert.equal(byId.get('fast')!.alsoBehind, false, 'idle but ahead is not the same problem');
});

test('studentsToWatch never lists a student for being slow alone', () => {
  const rows = [
    student({ userId: 'slow', progress: 2, lastActive: daysAgo(1) }),
    student({ userId: 'b', progress: 60 }),
    student({ userId: 'c', progress: 70 }),
    student({ userId: 'd', progress: 80 }),
    student({ userId: 'e', progress: 90 }),
  ];
  assert.deepEqual(studentsToWatch(rows, NOW).rows, []);
});

test('studentsToWatch puts never-started first, then the longest silence', () => {
  const rows = [
    student({ userId: 'idle-short', lastActive: daysAgo(15) }),
    student({ userId: 'idle-long', lastActive: daysAgo(60) }),
    student({ userId: 'never', mastered: 0, progress: 0, lastActive: null }),
  ];
  assert.deepEqual(
    studentsToWatch(rows, NOW).rows.map((r) => r.userId),
    ['never', 'idle-long', 'idle-short'],
  );
});

test('studentsToWatch survives a clock-skewed or unreadable timestamp', () => {
  const future = studentsToWatch([student({ userId: 'a', lastActive: daysAgo(-5) })], NOW);
  assert.deepEqual(future.rows, [], 'a future timestamp is skew, not a flag');

  const junk = studentsToWatch([student({ userId: 'a', lastActive: 'not a date' })], NOW);
  assert.deepEqual(junk.rows, []);
});

// -------------------------------------------------------------- bottlenecks

const nodes = (...ids: string[]): GraphNode[] => ids.map((id) => ({ id, title: id.toUpperCase() }));
const edge = (nodeId: string, prereqId: string): GraphEdge => ({ nodeId, prereqId });

/** Narrows the union so a test can index the rows. */
function rowsOf(result: ReturnType<typeof bottlenecks>): Bottleneck[] {
  if (!Array.isArray(result)) return assert.fail(`suppressed: ${result.reason}`);
  return result;
}

test('bottlenecks suppresses the whole panel below the five-student floor', () => {
  const result = bottlenecks(nodes('a', 'b'), [edge('b', 'a')], new Map(), 4);
  assert.equal(Array.isArray(result), false);
  if (Array.isArray(result)) return;
  assert.equal(result.size, 4);
  assert.match(result.reason, /hidden below 5/);
});

test('bottlenecks counts every skill downstream, not just the next one', () => {
  // a -> b -> c -> d, plus a -> e
  const rows = rowsOf(
    bottlenecks(
      nodes('a', 'b', 'c', 'd', 'e'),
      [edge('b', 'a'), edge('c', 'b'), edge('d', 'c'), edge('e', 'a')],
      new Map(),
      10,
    ),
  );
  const blocks = new Map(rows.map((r) => [r.nodeId, r.blocks]));
  assert.equal(blocks.get('a'), 4);
  assert.equal(blocks.get('b'), 2);
  assert.equal(blocks.get('c'), 1);
  assert.equal(blocks.get('d'), undefined, 'a leaf blocks nothing and is not a bottleneck');
});

test('bottlenecks does not double-count a skill reachable by two paths', () => {
  // a -> b, a -> c, both -> d
  const rows = rowsOf(
    bottlenecks(
      nodes('a', 'b', 'c', 'd'),
      [edge('b', 'a'), edge('c', 'a'), edge('d', 'b'), edge('d', 'c')],
      new Map(),
      10,
    ),
  );
  assert.equal(rows.find((r) => r.nodeId === 'a')!.blocks, 3);
});

test('bottlenecks terminates on a cycle the parser produced', () => {
  const rows = rowsOf(
    bottlenecks(nodes('a', 'b', 'c'), [edge('b', 'a'), edge('c', 'b'), edge('a', 'c')], new Map(), 10),
  );
  assert.equal(rows.length, 3);
  for (const row of rows) assert.equal(row.blocks, 2);
});

test('bottlenecks drops an edge naming a node that is not in the graph', () => {
  const rows = rowsOf(
    bottlenecks(nodes('a', 'b'), [edge('b', 'a'), edge('ghost', 'a'), edge('b', 'ghost')], new Map(), 10),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.blocks, 1);
});

test('bottlenecks reports a withheld count as unknown, never as zero', () => {
  const rows = rowsOf(bottlenecks(nodes('a', 'b'), [edge('b', 'a')], new Map(), 24));
  assert.equal(rows[0]!.clearedAtMost, null);
  // Withheld means four or fewer cleared it, so at least twenty have not. The
  // floor narrows the claim; it does not delete it.
  assert.equal(rows[0]!.waitingAtLeast, 20);
  assert.equal(rows[0]!.lockedOut, 20);
});

test('bottlenecks turns a count that cleared the floor into students still waiting', () => {
  const rows = rowsOf(bottlenecks(nodes('a', 'b'), [edge('b', 'a')], new Map([['a', 9]]), 24));
  assert.equal(rows[0]!.clearedAtMost, 9);
  assert.equal(rows[0]!.waitingAtLeast, 15);
});

test('bottlenecks never reports a negative wait when a count outruns the roster', () => {
  const rows = rowsOf(bottlenecks(nodes('a', 'b'), [edge('b', 'a')], new Map([['a', 30]]), 24));
  assert.equal(rows[0]!.waitingAtLeast, 0);
  assert.equal(rows[0]!.lockedOut, 0);
});

test('bottlenecks ranks the skill costing the class the most, not the widest one', () => {
  // `wide` gates three skills but almost everyone has cleared it. `deep` gates
  // one and hardly anyone has. The class is stuck on `deep`.
  const rows = rowsOf(
    bottlenecks(
      nodes('wide', 'w1', 'w2', 'w3', 'deep', 'd1'),
      [edge('w1', 'wide'), edge('w2', 'wide'), edge('w3', 'wide'), edge('d1', 'deep')],
      new Map([['wide', 22], ['deep', 5]]),
      24,
    ),
  );
  assert.equal(rows[0]!.nodeId, 'deep');
  assert.equal(rows[0]!.lockedOut, 19);
  assert.equal(rows[1]!.lockedOut, 6);
});

test('bottlenecks honours the limit', () => {
  const rows = rowsOf(
    bottlenecks(
      nodes('a', 'b', 'c', 'd'),
      [edge('b', 'a'), edge('c', 'b'), edge('d', 'c')],
      new Map(),
      10,
      2,
    ),
  );
  assert.deepEqual(rows.map((r) => r.nodeId), ['a', 'b']);
});

test('bottlenecks on an empty or edgeless course returns nothing to act on', () => {
  assert.deepEqual(rowsOf(bottlenecks([], [], new Map(), 6)), []);
  assert.deepEqual(rowsOf(bottlenecks(nodes('a', 'b'), [], new Map(), 6)), []);
});

// ------------------------------------------------------ clearedUpperBounds

const mission = (id: string, skillId: string) => ({ id, skillId });

test('clearedUpperBounds takes the weakest mission as the ceiling for its node', () => {
  const bounds = clearedUpperBounds(
    [mission('m1', 'a'), mission('m2', 'a'), mission('m3', 'a')],
    new Map([['m1', 20], ['m2', 9], ['m3', 14]]),
  );
  assert.equal(bounds.get('a'), 9, 'nobody can have finished the node without the hardest mission');
});

test('clearedUpperBounds withholds a node when any one mission is under the floor', () => {
  const bounds = clearedUpperBounds([mission('m1', 'a'), mission('m2', 'a')], new Map([['m1', 20]]));
  assert.equal(bounds.has('a'), false, 'm2 was suppressed, so the node is too');
});

test('clearedUpperBounds withholds a node whose own ceiling is under the floor', () => {
  assert.equal(clearedUpperBounds([mission('m1', 'a')], new Map([['m1', 4]])).has('a'), false);
});

test('clearedUpperBounds says nothing about a node with no missions', () => {
  assert.equal(clearedUpperBounds([], new Map([['m1', 30]])).size, 0);
});

test('clearedUpperBounds keeps nodes apart', () => {
  const bounds = clearedUpperBounds(
    [mission('m1', 'a'), mission('m2', 'b')],
    new Map([['m1', 12], ['m2', 30]]),
  );
  assert.deepEqual([...bounds.entries()].sort(), [['a', 12], ['b', 30]]);
});

test('clearedUpperBounds feeds bottlenecks a ceiling, never a count', () => {
  const bounds = clearedUpperBounds(
    [mission('m1', 'a'), mission('m2', 'a')],
    new Map([['m1', 6], ['m2', 18]]),
  );
  const rows = rowsOf(bottlenecks(nodes('a', 'b'), [edge('b', 'a')], bounds, 24));
  assert.equal(rows[0]!.clearedAtMost, 6);
  assert.equal(rows[0]!.waitingAtLeast, 18);
});

