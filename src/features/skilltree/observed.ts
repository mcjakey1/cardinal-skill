/**
 * What the app has actually observed, turned into the shapes `adaptive.ts`
 * expects.
 *
 * The adaptive engine takes `NodeSignal`s with four observations on them. This
 * build can honestly produce two of them, and being precise about which is the
 * whole reason this file exists rather than a cast at the call site:
 *
 *   * `msSpent` — real. Time the node's detail window was open.
 *   * `attempts` — **how many times the node was opened**, not how many times
 *     the student tried and failed. There is no submit-and-check anywhere in
 *     this product, so a genuine attempt count does not exist to be read.
 *     Returning to a node repeatedly is a real signal of being stuck, and it is
 *     the closest honest thing there is; it is named `attempts` because that is
 *     the field the engine reads, not because the two mean the same thing.
 *   * `hintsUsed` — **always 0.** There is no hint feature. Inventing a number
 *     here would move `struggleScore` on evidence that does not exist.
 *   * `helpRequested` — real. Set once a help subtree has been grafted.
 *
 * That ceiling is worth knowing: with hints always zero, `struggleScore` tops
 * out at 0.80 rather than 1.0, which still clears `HELP_THRESHOLD` (0.55) on
 * time overrun and repeat visits alone.
 *
 * Pure and dependency-free, same contract as `progression.ts`.
 */

import type { LearnerSignals, NodeSignal } from './types';

/** One node's observed history on this device. */
export interface Visit {
  /** Times the detail window was opened on it. See the note above. */
  attempts: number;
  /** Milliseconds the detail window was open, accumulated. */
  msSpent: number;
  helpRequested: boolean;
}

export const NO_VISIT: Visit = { attempts: 0, msSpent: 0, helpRequested: false };

const DAY_MS = 86_400_000;

export function nodeSignal(
  nodeId: string,
  visit: Visit | undefined,
  masteredAt?: string | null,
): NodeSignal {
  const v = visit ?? NO_VISIT;
  return {
    nodeId,
    attempts: v.attempts,
    msSpent: v.msSpent,
    // Not a placeholder to be filled in later — there is nothing to count.
    hintsUsed: 0,
    helpRequested: v.helpRequested,
    masteredAt: masteredAt ?? null,
  };
}

/**
 * Days since the first thing this student ever finished, counted inclusively.
 *
 * Never zero. `paceTarget` divides by `daysActive / 7`, and a student who
 * finished their first node an hour ago has been active for one day, not none.
 */
export function daysActive(timestamps: Iterable<string>, today: Date = new Date()): number {
  let earliest = Number.POSITIVE_INFINITY;
  for (const iso of timestamps) {
    const ms = Date.parse(iso);
    // A corrupt entry in the local log is not worth failing over; it is skipped
    // so one bad row cannot drag the start date to the epoch.
    if (Number.isFinite(ms) && ms < earliest) earliest = ms;
  }
  if (!Number.isFinite(earliest)) return 1;

  // Counted on day boundaries rather than elapsed milliseconds, so "yesterday
  // evening to this morning" is two days the way a person would say it.
  const startDay = Math.floor(earliest / DAY_MS);
  const todayDay = Math.floor(today.getTime() / DAY_MS);
  return Math.max(1, todayDay - startDay + 1);
}

/**
 * Everything the engine knows about one learner on one course.
 *
 * A node that was mastered without ever being opened still gets a signal: the
 * student may have finished it from the mission list, and leaving it out would
 * hide it from `paceTarget`, which counts mastered nodes.
 */
export function learnerSignals(
  visits: Record<string, Visit>,
  masteredAtById: Record<string, string>,
  streakDays: number,
  today: Date = new Date(),
): LearnerSignals {
  const ids = new Set([...Object.keys(visits ?? {}), ...Object.keys(masteredAtById ?? {})]);

  return {
    nodeSignals: [...ids].map((id) => nodeSignal(id, visits?.[id], masteredAtById?.[id])),
    streakDays: Number.isFinite(streakDays) ? streakDays : 0,
    daysActive: daysActive(Object.values(masteredAtById ?? {}), today),
  };
}
