/**
 * Five simulated learners with genuinely different abilities, used to check
 * that the adaptive engine accommodates each of them rather than merely
 * returning something for each of them.
 *
 * Deterministic by construction: a seeded PRNG and a fixed epoch, no clock and
 * no `Math.random`. Same seed, same signals — so a failing assertion is a
 * regression and never a bad roll. The randomness only varies magnitudes
 * *within* each profile's band; every band is wide of the engine's thresholds,
 * so which mode a profile lands in does not depend on the seed either.
 */

import { DEFAULT_ESTIMATED_MINUTES } from './adaptive.ts';
import type { LearnerSignals, NodeSignal, Tree } from './types';

/** Fixed so `masteredAt` never depends on when the suite happens to run. */
const SIM_EPOCH_MS = Date.parse('2026-01-05T09:00:00.000Z');
const DAY_MS = 86_400_000;

/**
 * mulberry32. Twenty lines of PRNG rather than a dependency, and rather than
 * `Math.random`, which would make every assertion below a coin flip.
 */
export function mulberry32(seed: number): () => number {
  let a = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type LearnerProfileId = 'fast' | 'steady' | 'slow' | 'erratic' | 'plateaued';

/** What one learner did on one node, before it is scaled by the node's size. */
interface Effort {
  attempts: number;
  /** Multiple of the node's estimate they spent on it. */
  timeFactor: number;
  hints: number;
}

interface NodeContext {
  index: number;
  mastered: boolean;
  /** The node they are sitting on now: the first one they have not mastered. */
  isCurrent: boolean;
}

export interface LearnerProfile {
  id: LearnerProfileId;
  label: string;
  /** Share of the tree mastered so far, in syllabus order. */
  masteredShare: number;
  daysActive: number;
  streakDays: number;
  effort(rand: () => number, ctx: NodeContext): Effort;
}

const span = (rand: () => number, lo: number, hi: number) => lo + rand() * (hi - lo);
const intSpan = (rand: () => number, lo: number, hi: number) => Math.round(span(rand, lo, hi));

export const LEARNER_PROFILES: Record<LearnerProfileId, LearnerProfile> = {
  fast: {
    id: 'fast',
    label: 'Fast',
    masteredShare: 0.85,
    daysActive: 14,
    streakDays: 12,
    effort: (rand) => ({ attempts: 1, timeFactor: span(rand, 0.4, 0.7), hints: 0 }),
  },

  steady: {
    id: 'steady',
    label: 'Steady',
    masteredShare: 0.5,
    daysActive: 21,
    streakDays: 5,
    effort: (rand) => ({
      attempts: intSpan(rand, 2, 3),
      timeFactor: span(rand, 1.05, 1.4),
      hints: intSpan(rand, 0, 1),
    }),
  },

  slow: {
    id: 'slow',
    label: 'Slow',
    masteredShare: 0.25,
    daysActive: 28,
    streakDays: 1,
    effort: (rand) => ({
      attempts: intSpan(rand, 4, 6),
      timeFactor: span(rand, 2.5, 3.5),
      hints: intSpan(rand, 1, 2),
    }),
  },

  erratic: {
    id: 'erratic',
    label: 'Erratic',
    masteredShare: 0.5,
    daysActive: 21,
    // The streak keeps breaking, which is the point: alternating days of
    // clean work and days of getting nowhere never accumulate into one.
    streakDays: 1,
    effort: (rand, ctx) =>
      ctx.index % 2 === 0
        ? { attempts: 1, timeFactor: span(rand, 0.4, 0.7), hints: 0 }
        : { attempts: 5, timeFactor: span(rand, 3, 3.5), hints: 3 },
  },

  plateaued: {
    id: 'plateaued',
    label: 'Plateaued',
    masteredShare: 0.5,
    daysActive: 30,
    streakDays: 0,
    effort: (rand, ctx) => {
      if (ctx.mastered) return { attempts: 1, timeFactor: span(rand, 0.8, 1), hints: 0 };
      // Everything past the wall is untouched — they never got there. Only the
      // one node they are stuck on carries effort, which is what separates a
      // plateau from a learner who is uniformly slow.
      if (!ctx.isCurrent) return { attempts: 0, timeFactor: 0, hints: 0 };
      return { attempts: 9, timeFactor: 4, hints: 5 };
    },
  },
};

/** Every profile, in a stable order, for tests that sweep all five. */
export const ALL_PROFILES: LearnerProfile[] = Object.values(LEARNER_PROFILES);

/**
 * Produce one learner's signals over a tree. Pure: same profile, tree, and
 * seed give byte-identical output.
 */
export function generateSignals(
  profile: LearnerProfile,
  tree: Tree,
  seed: number,
): LearnerSignals {
  const rand = mulberry32(seed);
  const nodes = [...tree.nodes].sort((a, b) => a.sortOrder - b.sortOrder);
  const masteredCount = Math.min(
    nodes.length,
    Math.max(0, Math.round(nodes.length * profile.masteredShare)),
  );

  const nodeSignals: NodeSignal[] = nodes.map((node, index) => {
    const mastered = index < masteredCount;
    const effort = profile.effort(rand, { index, mastered, isCurrent: index === masteredCount });
    const minutes =
      node.estimatedMinutes && node.estimatedMinutes > 0
        ? node.estimatedMinutes
        : DEFAULT_ESTIMATED_MINUTES;

    return {
      nodeId: node.id,
      attempts: effort.attempts,
      msSpent: Math.round(minutes * 60_000 * effort.timeFactor),
      hintsUsed: effort.hints,
      // No profile has asked for help yet — that is the decision the engine is
      // being tested on. A profile that had already asked would short-circuit
      // `shouldOfferHelp` and prove nothing.
      helpRequested: false,
      masteredAt: mastered ? new Date(SIM_EPOCH_MS + index * DAY_MS).toISOString() : null,
    };
  });

  return { nodeSignals, streakDays: profile.streakDays, daysActive: profile.daysActive };
}
