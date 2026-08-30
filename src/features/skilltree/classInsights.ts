/**
 * Class analytics an instructor can act on, and the evidence for each one.
 *
 * The screen this replaced showed an average, a total, and a completion count
 * per skill. All three are true and none of them names anything to do, which is
 * the failure the literature on these dashboards keeps finding: Kaliisa et al.'s
 * review of 38 studies found no evidence that learning dashboards improve
 * achievement, and Jivet et al. found they are rarely grounded in any theory of
 * learning at all. So every export here is paired with an action, and anything
 * that would only rank people has been left out.
 *
 * WHY EACH ONE EXISTS
 *
 * `classSpread` — the shape of the class, not its mean. A class where half have
 *   finished and half have not started averages to a comfortable fifty percent.
 *   Counts rather than percentages, because at these cohort sizes a percentage
 *   implies precision that is not there: Kane & Staiger found 28% of the
 *   variance in one grade's scores at an average-sized school is pure sampling
 *   noise, and at n=12 one student moving is eight points.
 *     → Kane & Staiger 2002, "The Promise and Pitfalls of Using Imprecise
 *       School Accountability Measures", JEP 16(4):91-114.
 *       https://www.aeaweb.org/articles?id=10.1257/089533002320950993
 *     → Hullman 2020, "Why Authors Don't Visualize Uncertainty", IEEE TVCG
 *       26(1). https://arxiv.org/abs/1908.01697
 *
 * `studentsToWatch` — recency of activity is the strongest single cheap signal
 *   in trace data; Whitehill et al. got 82% dropout-prediction accuracy from
 *   days-since-last-interaction alone, and Macfadyen & Dawson identified 81% of
 *   eventual failures from LMS variables. It is deliberately *not* a risk score:
 *   Gasevic et al. showed the weights are course-specific, so a score borrowed
 *   from someone else's course is not evidence. Standing in the class annotates
 *   a row and never creates one, because a rank alone flags the slowest quarter
 *   every week by construction — and Kluger & DeNisi found over a third of
 *   feedback interventions made performance *worse*, reliably the ones aimed at
 *   the person rather than the task.
 *     → Whitehill et al. 2017, "Delving Deeper into MOOC Student Dropout
 *       Prediction". https://arxiv.org/abs/1702.06404
 *     → Macfadyen & Dawson 2010, "Mining LMS data to develop an early warning
 *       system", Computers & Education 54(2):588-599.
 *     → Gasevic et al. 2016, "Learning analytics should not promote one size
 *       fits all", Internet & Higher Education 28:68-84.
 *     → Kluger & DeNisi 1996, "The effects of feedback interventions on
 *       performance", Psych. Bulletin 119(2):254-284.
 *     → Hattie & Timperley 2007, "The Power of Feedback", RER 77(1):81-112 —
 *       task-level feedback works, self-level feedback does not.
 *
 * `bottlenecks` — the blocking factor from curricular analytics: how much of the
 *   course a node holds shut. It is the one metric here computed from the course
 *   itself rather than from the class, so it carries no sampling noise and needs
 *   no suppression. Its formal parent is the surmise relation in knowledge space
 *   theory, which is what a prerequisite edge already is.
 *     → Heileman, Abdallah, Slim & Hickman 2018, "Curricular Analytics".
 *       https://arxiv.org/abs/1811.09676
 *     → Doignon & Falmagne, Knowledge Spaces. https://arxiv.org/abs/1511.06757
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * No leaderboard, no XP panel, no student-versus-student rank. XP in a mastery
 * tree is a monotone re-encoding of the mastered count, so an XP panel is the
 * progress panel in a costume — and Jivet et al. found dashboards already
 * oversupply competition, while Teasley's review found comparative displays
 * motivate high achievers and demotivate exactly the low achievers that mastery
 * learning helps most (Kulik, Kulik & Bangert-Drowns, 108 evaluations).
 *
 * No time-on-task and no click counts. Kovanovic et al. showed time-on-task from
 * trace data is inferred rather than measured, and that the choice of inference
 * heuristic changes the conclusions. It would be a liability, not a gap.
 *     → Jivet, Scheffel, Specht & Drachsler 2018, "License to evaluate", LAK'18.
 *     → Teasley 2017, "Student Facing Dashboards: One Size Fits All?",
 *       Tech Knowl Learn 22(3):377-384.
 *     → Kulik, Kulik & Bangert-Drowns 1990, "Effectiveness of Mastery Learning
 *       Programs: A Meta-Analysis", RER 60(2):265-299.
 *     → Kovanovic et al. 2015, "Does Time-on-task Estimation Matter?", JLA 2(3).
 *     → Kaliisa, Misiejuk, Lopez-Pernas, Khalil & Saqr 2024, "Have Learning
 *       Analytics Dashboards Lived Up to the Hype?", LAK'24.
 *
 * The five-student floor in `cohort.ts` is the sector norm, not a local
 * invention: NCES puts state minimum-group sizes between 5 and 30.
 *     → Seastrom 2010, SLDS Technical Brief 3, NCES 2011-603.
 *       https://nces.ed.gov/pubs2011/2011603.pdf
 *
 * Pure and dependency-free, same contract as `progression.ts`.
 */

// `activityFlag` owns what counts as stopped, and `MIN_COHORT` owns the floor.
// Both stay defined once, in `cohort.ts`, so this file cannot drift from the
// roster's answer to the same question.
import { MIN_COHORT, activityFlag } from './cohort.ts';

/**
 * One roster row, as far as these rules need to know. Field names match
 * `RosterRow` in `app/instructor.tsx` so a roster row satisfies this
 * structurally — the route owns the query, this module owns the arithmetic.
 */
export interface ProgressRow {
  userId: string;
  displayName: string;
  mastered: number;
  gradedNodes: number;
  /** Percent of the graded tree cleared, 0–100. */
  progress: number;
  /** ISO timestamp of the last thing this student cleared. */
  lastActive: string | null;
}

/** Every figure here either arrives or says why it did not. */
export type Suppressed = { suppressed: true; size: number; reason: string };

const tooFew = (size: number, what: string): Suppressed => ({
  suppressed: true,
  size,
  reason: `Only ${size} ${size === 1 ? 'student is' : 'students are'} on this course. ${what} is hidden below ${MIN_COHORT}, because a figure over a handful of people points at those people.`,
});

/**
 * The R type-7 quantile — the default in numpy, pandas and R, so a figure
 * printed here matches one an instructor recomputes in a spreadsheet.
 */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

// ------------------------------------------------------- 1. where the class is

export type BandKey = 'none' | 'early' | 'partway' | 'most' | 'done';

export interface ProgressBand {
  key: BandKey;
  label: string;
  /**
   * Students in this band. A count, and never a percentage: at these cohort
   * sizes "25%" is three people, and printing the percentage claims a precision
   * a class of twelve does not have. The screen draws the bar from
   * `count / size` and prints "3 of 12".
   */
  count: number;
}

const BANDS: { key: BandKey; label: string; holds: (p: number) => boolean }[] = [
  { key: 'none', label: 'Nothing yet', holds: (p) => p <= 0 },
  { key: 'early', label: 'Just started', holds: (p) => p > 0 && p < 25 },
  { key: 'partway', label: 'Partway', holds: (p) => p >= 25 && p < 75 },
  { key: 'most', label: 'Nearly there', holds: (p) => p >= 75 && p < 100 },
  { key: 'done', label: 'Finished', holds: (p) => p >= 100 },
];

export interface ClassSpread {
  suppressed: false;
  size: number;
  /** Percent of the tree the middle student has cleared. */
  median: number;
  /** The slowest quarter is at or below this; the fastest at or above `upper`. */
  lower: number;
  upper: number;
  bands: ProgressBand[];
  /**
   * The class has pulled apart into a fast group and a stuck group, with little
   * in between — one pace cannot serve both.
   */
  split: boolean;
}

/**
 * How far through the tree the class is — as a shape, not one number.
 *
 * The average is the metric this screen used to lead with and it is the one that
 * misleads: a class where half have finished and half have not started averages
 * out to a comfortable fifty percent, and a comfortable fifty percent is exactly
 * the reading that lets a term go wrong quietly. The bands and the quartiles are
 * here so that class is visibly two classes.
 */
export function classSpread(rows: readonly ProgressRow[]): ClassSpread | Suppressed {
  if (rows.length < MIN_COHORT) return tooFew(rows.length, 'The spread of the class');

  const sorted = rows.map((r) => clampPercent(r.progress)).sort((a, b) => a - b);
  const size = sorted.length;

  const bands = BANDS.map((band) => ({
    key: band.key,
    label: band.label,
    count: sorted.filter(band.holds).length,
  }));

  const share = (key: BandKey) => bands.find((b) => b.key === key)!.count / size;

  // ponytail: a named threshold, not a mixture model. Both ends heavy and the
  // middle nearly empty is the shape worth naming; anything subtler than that
  // needs more students than a class has. Swap for a dip test if a cohort ever
  // gets large enough for one to mean anything.
  const split =
    share('none') + share('early') >= 1 / 3 &&
    share('most') + share('done') >= 1 / 3 &&
    share('partway') <= 1 / 5;

  return {
    suppressed: false,
    size,
    median: Math.round(quantile(sorted, 0.5)),
    lower: Math.round(quantile(sorted, 0.25)),
    upper: Math.round(quantile(sorted, 0.75)),
    bands,
    split,
  };
}

const clampPercent = (n: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;

// ------------------------------------------------------ 2. who to check on now

export interface WatchRow {
  userId: string;
  displayName: string;
  /** Cleared nothing at all, or was moving and stopped. */
  reason: 'not-started' | 'idle';
  /** Whole days since this student last cleared anything. Null if never. */
  daysIdle: number | null;
  progress: number;
  /**
   * Also in the slowest quarter of the class. Null when the class is too small
   * to rank anyone against it — the row still stands on its own flag.
   */
  alsoBehind: boolean | null;
}

export interface WatchList {
  size: number;
  rows: WatchRow[];
  /** True when the class is under the floor, so only the absolute flags ran. */
  rankingSuppressed: boolean;
  /** The quarter mark the ranking used, or null when it was not computed. */
  lowerQuartile: number | null;
}

/**
 * The students worth a message this week, and why.
 *
 * Two signals, deliberately combined rather than scored. Recency of activity is
 * the cheapest and strongest leading indicator available from trace data, and
 * standing relative to the class is the second — but either alone produces a
 * list nobody should act on. Rank alone flags the slowest quarter every single
 * week by construction, including the student who is simply steady and fine,
 * which is how a dashboard starts shaming people. Recency alone cannot tell a
 * student who has stopped from one who has finished.
 *
 * So the flag is absolute (has this person stopped, or never begun) and the rank
 * is only ever an *annotation* on it. Nobody appears on this list for being slow.
 */
export function studentsToWatch(rows: readonly ProgressRow[], now: Date): WatchList {
  const rankable = rows.length >= MIN_COHORT;
  const lowerQuartile = rankable
    ? quantile(
        rows.map((r) => clampPercent(r.progress)).sort((a, b) => a - b),
        0.25,
      )
    : null;

  const flagged: WatchRow[] = [];
  for (const row of rows) {
    const reason = activityFlag(row, now);
    if (!reason) continue;
    flagged.push({
      userId: row.userId,
      displayName: row.displayName,
      reason: reason === 'not-started' ? 'not-started' : 'idle',
      daysIdle: daysSince(row.lastActive, now),
      progress: clampPercent(row.progress),
      alsoBehind: lowerQuartile === null ? null : clampPercent(row.progress) <= lowerQuartile,
    });
  }

  // Never begun first, then the longest silences. Both are things an instructor
  // can act on today; a sort by name is not.
  const weight = (r: WatchRow) => (r.reason === 'not-started' ? 0 : 1);
  flagged.sort(
    (a, b) => weight(a) - weight(b) || (b.daysIdle ?? Infinity) - (a.daysIdle ?? Infinity),
  );

  return {
    size: rows.length,
    rows: flagged,
    rankingSuppressed: !rankable,
    lowerQuartile: lowerQuartile === null ? null : Math.round(lowerQuartile),
  };
}

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((now.getTime() - then) / 86_400_000);
  // A future timestamp is a clock-skewed device, not a student who has been
  // idle for minus three days. `activityFlag` swallows the same case.
  return days < 0 ? 0 : days;
}

// --------------------------------------------------- 3. what is blocking whom

/** One mission, as far as this rule needs to know. `skillId` is its node. */
export interface MissionRef {
  id: string;
  skillId: string;
}

/**
 * A ceiling on how many students have cleared each node, and never a count.
 *
 * The database will not tell us this exactly. `course_mission_summary` returns
 * per-*mission* completions, and a node is cleared only when every one of its
 * missions is done — so the most students who can have finished all of them is
 * the smallest of those counts. The true figure is at or below it: three
 * students could each have done a different two of three missions and produce
 * the same numbers with nobody having cleared the node at all.
 *
 * That gap is why the screen says "up to". It is not an inability to count; it
 * is the same suppression working — the summary drops any mission under five
 * completions, so a node with one such mission is withheld here rather than
 * estimated, and a node whose missions all clear the floor still cannot be
 * pinned down from aggregates alone.
 *
 * A node with no missions gets no entry: mission data cannot speak for it.
 *
 * Follow-up rather than a fudge: an RPC applying the same rule
 * `course_student_progress` uses (every mission done, or a direct mastery on a
 * mission-less node) would make this exact. That is a migration, not this file.
 */
export function clearedUpperBounds(
  missions: readonly MissionRef[],
  perMissionCompletions: ReadonlyMap<string, number>,
): Map<string, number | null> {
  const byNode = new Map<string, number[]>();
  for (const mission of missions) {
    // A mission absent from the summary is under the floor. Recording it as
    // -1 makes the node's minimum fall below the floor too, so the whole node
    // is withheld below — which is exactly the honest answer.
    const count = perMissionCompletions.get(mission.id) ?? -1;
    const list = byNode.get(mission.skillId);
    if (list) list.push(count);
    else byNode.set(mission.skillId, [count]);
  }

  // Two different unknowns, and collapsing them is how a missing measurement
  // becomes a fabricated alarm. A node that HAS missions but whose count fell
  // under the floor is recorded as null — "four or fewer", a real bound worth
  // acting on. A node with no missions gets no entry at all, because nothing
  // here can speak for it, and a caller must not read that silence as a low
  // number.
  const bounds = new Map<string, number | null>();
  for (const [nodeId, counts] of byNode) {
    const least = Math.min(...counts);
    bounds.set(nodeId, least >= MIN_COHORT ? least : null);
  }
  return bounds;
}

export interface GraphNode {
  id: string;
  title: string;
}

export interface GraphEdge {
  nodeId: string;
  prereqId: string;
}

export interface Bottleneck {
  nodeId: string;
  title: string;
  /**
   * How many later skills this one gates, counted through the whole graph.
   * Structural: it is a property of the course, not of the class, so it is
   * never suppressed and never uncertain.
   */
  blocks: number;
  /**
   * The most students who could have cleared this skill — see
   * `clearedUpperBounds` for why it is a ceiling and not a count. Null when the
   * figure was withheld, which is *not* zero: it means four or fewer, and a
   * screen that draws a zero there is lying.
   */
  clearedAtMost: number | null;
  /**
   * The fewest students who cannot have cleared it. Always known, even when
   * `clearedAtMost` is withheld — withheld means four or fewer cleared it, so at
   * least the class minus four are still behind it. Suppression narrows what can
   * be said; it does not erase it.
   */
  waitingAtLeast: number;
  /**
   * Student-skill pairs shut behind this one node: everyone still waiting,
   * times everything downstream of it. The ranking figure, and a floor rather
   * than an estimate — both its inputs are floors.
   */
  lockedOut: number;
}

/**
 * The skills holding the most of the course shut, and how much of the class is
 * still behind each one.
 *
 * `blocks` is the blocking factor from curricular analytics: the count of nodes
 * that become unreachable while this one is unmastered. A prerequisite gating
 * one optional reading and one gating the back half of the term are not the same
 * problem, and a flat list of completion counts cannot tell them apart — which
 * is exactly what the screen this replaced offered.
 *
 * The ranking multiplies that by the students still behind it, which is how
 * gateway and bottleneck courses are identified in practice: foundational,
 * widely taken, and widely not passed. One node at the top of this list, and a
 * verb next to it, is the whole point of the panel.
 *
 * ponytail: a depth-first walk per node, no memo. A course tree is tens of nodes,
 * so O(V·E) is microseconds; memoise in reverse topological order if a syllabus
 * ever produces thousands.
 */
export function bottlenecks(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  // Keyed by node: a number is a measured ceiling, null is measured-and-
  // withheld ("four or fewer"), and an absent key means mission data cannot
  // speak for the node at all. The third is not the second.
  clearedCounts: ReadonlyMap<string, number | null>,
  classSize: number,
  limit = 5,
): Bottleneck[] | Suppressed {
  // Everything below the structural half is a figure about this class, so the
  // panel goes as a whole rather than shipping half a table.
  if (classSize < MIN_COHORT) return tooFew(classSize, 'Where the class is stuck');

  const known = new Set(nodes.map((n) => n.id));
  // Prereq edges point backwards (node depends on prereq). Unlocking runs the
  // other way, so the walk does too. Edges naming a node we do not have are
  // dropped: the parser is untrusted input and dangling ids do occur.
  const unlocks = new Map<string, string[]>();
  for (const e of edges) {
    if (!known.has(e.nodeId) || !known.has(e.prereqId)) continue;
    const list = unlocks.get(e.prereqId);
    if (list) list.push(e.nodeId);
    else unlocks.set(e.prereqId, [e.nodeId]);
  }

  const downstream = (start: string): number => {
    const seen = new Set<string>([start]);
    const stack = [start];
    while (stack.length > 0) {
      for (const next of unlocks.get(stack.pop()!) ?? []) {
        // `seen` is what makes a cycle terminate. The parser can emit one and
        // `deriveStatuses` tolerates it, so this must too.
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    return seen.size - 1;
  };

  return nodes
    // Only nodes mission data can actually speak for. An absent entry means no
    // missions are defined on the node, not that few students cleared it —
    // reading it as "four or fewer" invents the largest possible number of
    // students waiting, and since the ranking multiplies by that, the nodes
    // nothing is known about would take the top of the list and become the
    // page's headline advice. A node this cannot measure is left out rather
    // than guessed at.
    .filter((node) => clearedCounts.has(node.id))
    .map((node) => {
      const clearedAtMost = clearedCounts.get(node.id) ?? null;
      const blocks = downstream(node.id);
      const waitingAtLeast = Math.max(
        0,
        classSize - (clearedAtMost ?? MIN_COHORT - 1),
      );
      return {
        nodeId: node.id,
        title: node.title,
        blocks,
        clearedAtMost,
        waitingAtLeast,
        lockedOut: blocks * waitingAtLeast,
      };
    })
    // A leaf blocks nothing, so it can never be a bottleneck however few have
    // cleared it. It is still work to do; it is not work that is stopping anyone.
    .filter((row) => row.blocks > 0)
    .sort(
      (a, b) => b.lockedOut - a.lockedOut || b.blocks - a.blocks || a.title.localeCompare(b.title),
    )
    .slice(0, limit);
}
