/**
 * The adaptive learning engine: pure functions over `LearnerSignals`.
 *
 * It adapts pacing and sequencing — when to offer a scaffold, what to suggest
 * next, how fast levels should come — and never assessment. Nothing in here
 * reads a grade, and nothing in here writes one.
 *
 * Every function is total. A learner who signed up ten seconds ago has no
 * signals at all, and that is the most common input on day one of a course, so
 * "no data" returns a sensible default rather than NaN.
 */

// Runtime import, so it carries the .ts extension: `node --test` strips types
// but resolves specifiers as plain ESM, where an extensionless relative import
// does not exist. The type-only imports below are erased before resolution,
// which is why they stay extensionless like the rest of the repo.
import { deriveStatuses } from './progression.ts';
import type { LearnerSignals, NodeSignal, SkillNode, Tree } from './types';

/**
 * Assumed length of a node that carries no estimate. The parser does not
 * always produce one, and the time term of `struggleScore` needs a
 * denominator.
 *
 * ponytail: one number for every node kind. A reading and a project plainly
 * differ; use the per-kind table only once the parser reliably omits estimates
 * for a kind that matters.
 */
export const DEFAULT_ESTIMATED_MINUTES = 30;

/** Struggle score at or above which the UI offers to build a help subtree. */
export const HELP_THRESHOLD = 0.55;

/** Mode boundaries on mean struggle. Exported so a test can state its margin. */
export const STRUGGLING_AT = 0.45;
export const FAST_UNDER = 0.15;

/** Nodes per week assumed for a learner with nothing finished yet. */
export const DEFAULT_PACE = 2;

/** Pace floor and ceiling. A displayed target outside this is noise, not data. */
const MIN_PACE = 0.5;
const MAX_PACE = 10;

function num(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, lo: number, hi: number): number {
  return Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : lo;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function estimatedMs(node: SkillNode): number {
  const minutes = num(node.estimatedMinutes);
  return (minutes > 0 ? minutes : DEFAULT_ESTIMATED_MINUTES) * 60_000;
}

// ------------------------------------------------------------ a. struggle

/**
 * How stuck a learner looks on one node: 0 is cruising, 1 is stuck.
 *
 * Three observations, weighted: how often they retried, how far past the
 * node's estimate they ran, and how many hints they took. No grade goes in.
 *
 * ponytail: fixed weights and fixed saturation points, and those numbers are
 * the knobs. "A fourth attempt is maximum retry pressure" and "three times the
 * estimate is maximum time pressure" are guesses that need pilot data. Move
 * the numbers before reaching for a model that learns them.
 */
export function struggleScore(signal: NodeSignal, node: SkillNode): number {
  const attempts = Math.max(0, num(signal?.attempts));
  const hints = Math.max(0, num(signal?.hintsUsed));
  const msSpent = Math.max(0, num(signal?.msSpent));

  const retried = clamp01((attempts - 1) / 3);
  const overran = clamp01((msSpent / estimatedMs(node) - 1) / 2);
  const hinted = clamp01(hints / 3);

  return clamp01(0.45 * retried + 0.35 * overran + 0.2 * hinted);
}

export interface HelpOffer {
  offer: boolean;
  /** One sentence, ready to render. */
  reason: string;
  score: number;
}

/**
 * Whether to surface "need extra help" on a node, and what to say about it.
 *
 * Offering help on a node the student already mastered is the fastest way to
 * make the feature feel broken, so mastery short-circuits before the score is
 * even consulted.
 */
export function shouldOfferHelp(signal: NodeSignal, node: SkillNode): HelpOffer {
  const score = struggleScore(signal, node);

  if (signal?.masteredAt) {
    return { offer: false, reason: 'You have already mastered this one.', score };
  }
  if (signal?.helpRequested) {
    return { offer: false, reason: 'Extra practice steps are already on this node.', score };
  }
  if (score < HELP_THRESHOLD) {
    return { offer: false, reason: 'You are moving through this at a normal pace.', score };
  }
  return {
    offer: true,
    // ponytail: one sentence for every reason to be stuck. Naming the dominant
    // driver ("you have retried this five times") reads better and needs
    // `struggleScore` to return its parts — worth doing once the copy is tested
    // on students, not before.
    reason: `${node.title} is taking longer than most students need — extra practice steps can break it into smaller pieces.`,
    score,
  };
}

// ------------------------------------------------------- b. next-quest rank

export type LearnerMode = 'struggling' | 'steady' | 'fast';

/**
 * Which way to lean when sequencing for this learner.
 *
 * Measured over nodes they are *working on right now* — attempted, not yet
 * mastered — not over their whole history. A learner who breezed through six
 * nodes and then hit a wall is stuck today, and averaging in the six easy ones
 * hides exactly the plateau this is supposed to catch.
 */
export function learnerMode(tree: Tree, signals: LearnerSignals): LearnerMode {
  const nodeById = new Map(tree.nodes.map((n) => [n.id, n]));
  let inProgress = 0;
  let inProgressSum = 0;
  let all = 0;
  let allSum = 0;

  for (const signal of signals?.nodeSignals ?? []) {
    // A signal can outlive the node it describes: an instructor can delete a
    // node from the tree after a student has worked on it.
    const node = nodeById.get(signal.nodeId);
    if (!node) continue;
    const score = struggleScore(signal, node);
    all += 1;
    allSum += score;
    if (!signal.masteredAt && num(signal.attempts) > 0) {
      inProgress += 1;
      inProgressSum += score;
    }
  }

  const count = inProgress > 0 ? inProgress : all;
  if (count === 0) return 'steady';
  const mean = (inProgress > 0 ? inProgressSum : allSum) / count;

  if (mean >= STRUGGLING_AT) return 'struggling';
  if (mean <= FAST_UNDER && num(signals?.streakDays) >= 3) return 'fast';
  return 'steady';
}

/**
 * `nextQuests`, reordered by what this learner needs.
 *
 * Struggling: the smallest thing they can actually finish today, so the next
 * win is close. Fast: whichever available node opens up the most of the tree,
 * so they are never sequenced into a dead end. Steady: syllabus order, which
 * is what the instructor intended.
 */
export function rankNextQuests(
  tree: Tree,
  masteredIds: Iterable<string>,
  signals: LearnerSignals,
  limit = 3,
): SkillNode[] {
  const { status } = deriveStatuses(tree, masteredIds);
  const available = tree.nodes.filter((n) => status.get(n.id) === 'available');
  const bySyllabus = (a: SkillNode, b: SkillNode) =>
    a.sortOrder - b.sortOrder || a.xpReward - b.xpReward;

  switch (learnerMode(tree, signals)) {
    case 'struggling':
      return available
        .sort(
          (a, b) =>
            estimatedMs(a) - estimatedMs(b) || a.xpReward - b.xpReward || bySyllabus(a, b),
        )
        .slice(0, limit);
    case 'fast': {
      const unlocks = downstreamCounts(tree);
      return available
        .sort((a, b) => (unlocks.get(b.id) ?? 0) - (unlocks.get(a.id) ?? 0) || bySyllabus(a, b))
        .slice(0, limit);
    }
    default:
      return available.sort(bySyllabus).slice(0, limit);
  }
}

/**
 * How many nodes sit downstream of each node.
 *
 * ponytail: one BFS per node, O(n·e). A one-semester tree is tens of nodes, so
 * this is free; memoise in reverse topological order if a tree ever gets big
 * enough to notice. The per-source visited set also makes it terminate on the
 * cyclic graphs the parser can produce, without needing a separate guard.
 */
function downstreamCounts(tree: Tree): Map<string, number> {
  const known = new Set(tree.nodes.map((n) => n.id));
  const dependents = new Map<string, string[]>();
  for (const { nodeId, prereqId } of tree.prereqs) {
    if (!known.has(nodeId) || !known.has(prereqId) || nodeId === prereqId) continue;
    const list = dependents.get(prereqId);
    if (list) list.push(nodeId);
    else dependents.set(prereqId, [nodeId]);
  }

  const counts = new Map<string, number>();
  for (const node of tree.nodes) {
    const seen = new Set<string>([node.id]);
    const queue = [node.id];
    while (queue.length > 0) {
      for (const next of dependents.get(queue.pop()!) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    counts.set(node.id, seen.size - 1);
  }
  return counts;
}

// --------------------------------------------------- c. pace and XP targets

/**
 * Nodes per week this learner is actually sustaining.
 *
 * A learner with nothing mastered yet gets the starter pace rather than zero:
 * "your target is 0 nodes per week" is not a target, and dividing by an empty
 * history is where the NaN would come from.
 */
export function paceTarget(signals: LearnerSignals): number {
  const mastered = (signals?.nodeSignals ?? []).filter((s) => Boolean(s?.masteredAt)).length;
  if (mastered === 0) return DEFAULT_PACE;

  const days = Math.max(1, num(signals.daysActive, 1));
  return Math.round(clamp(mastered / (days / 7), MIN_PACE, MAX_PACE) * 10) / 10;
}
