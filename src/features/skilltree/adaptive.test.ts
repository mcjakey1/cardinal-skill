import assert from 'node:assert/strict';
import { test } from 'node:test';

// Explicit .ts extension: `node --test` strips types but does not resolve
// extensionless specifiers the way Metro does.
import {
  DEFAULT_PACE,
  HELP_THRESHOLD,
  learnerMode,
  paceTarget,
  rankNextQuests,
  shouldOfferHelp,
  struggleScore,
} from './adaptive.ts';
import { demoTree } from './demoTree.ts';
import { ALL_PROFILES, generateSignals, LEARNER_PROFILES } from './learners.ts';
import type { LearnerProfileId } from './learners.ts';
import { deriveStatuses, nextQuests } from './progression.ts';
import type { LearnerSignals, NodeSignal, SkillNode } from './types.ts';

const SEED = 20260805;
const nodeById = new Map(demoTree.nodes.map((n) => [n.id, n]));

const signalsFor = (id: LearnerProfileId): LearnerSignals =>
  generateSignals(LEARNER_PROFILES[id], demoTree, SEED);

/** The node a learner is most obviously stuck on: worst score, not yet mastered. */
function stuckest(signals: LearnerSignals): { signal: NodeSignal; node: SkillNode } {
  const open = signals.nodeSignals
    .filter((s) => !s.masteredAt)
    .map((signal) => ({ signal, node: nodeById.get(signal.nodeId)! }))
    .sort((a, b) => struggleScore(b.signal, b.node) - struggleScore(a.signal, a.node));
  return open[0]!;
}

test('every profile produces finite, non-negative numbers everywhere', () => {
  for (const profile of ALL_PROFILES) {
    const signals = generateSignals(profile, demoTree, SEED);
    const where = profile.id;

    for (const signal of signals.nodeSignals) {
      for (const [field, value] of [
        ['attempts', signal.attempts],
        ['msSpent', signal.msSpent],
        ['hintsUsed', signal.hintsUsed],
      ] as const) {
        assert.ok(Number.isFinite(value) && value >= 0, `${where}.${field} = ${value}`);
      }
      const score = struggleScore(signal, nodeById.get(signal.nodeId)!);
      assert.ok(score >= 0 && score <= 1, `${where} struggle score ${score} is outside 0..1`);
    }

    const pace = paceTarget(signals);
    assert.ok(Number.isFinite(pace) && pace > 0, `${where} pace ${pace}`);

    const quests = rankNextQuests(demoTree, [], signals, 3);
    const { status } = deriveStatuses(demoTree, []);
    assert.ok(quests.length > 0 && quests.length <= 3, `${where} got ${quests.length} quests`);
    for (const quest of quests) {
      assert.equal(status.get(quest.id), 'available', `${where} was sent at a locked node`);
    }
  }
});

test('the engine reads each profile as the kind of learner it is', () => {
  const mode = (id: LearnerProfileId) => learnerMode(demoTree, signalsFor(id));
  assert.equal(mode('fast'), 'fast');
  assert.equal(mode('steady'), 'steady');
  assert.equal(mode('slow'), 'struggling');
  assert.equal(mode('erratic'), 'struggling');
  assert.equal(mode('plateaued'), 'struggling', 'a plateau must not be averaged away by past wins');
});

test('help is offered to the slow and plateaued learners, not to the fast and steady ones', () => {
  for (const id of ['slow', 'plateaued'] as const) {
    const { signal, node } = stuckest(signalsFor(id));
    const offer = shouldOfferHelp(signal, node);
    assert.equal(offer.offer, true, `${id} should be offered help on ${node.id}`);
    assert.ok(offer.score >= HELP_THRESHOLD, `${id} score ${offer.score}`);
    assert.match(offer.reason, /extra practice steps/i, 'the reason has to say what happens next');
    assert.ok(offer.reason.includes(node.title), 'the reason names the node it is about');
  }

  for (const id of ['fast', 'steady'] as const) {
    const signals = signalsFor(id);
    for (const signal of signals.nodeSignals.filter((s) => !s.masteredAt)) {
      const node = nodeById.get(signal.nodeId)!;
      assert.equal(
        shouldOfferHelp(signal, node).offer,
        false,
        `${id} does not need help on ${node.id} (score ${struggleScore(signal, node)})`,
      );
    }
  }
});

test('help is never offered on a node the learner already mastered', () => {
  // The slow learner retried and overran the nodes they *did* finish, so their
  // mastered nodes score high. Mastery has to win anyway.
  const signals = signalsFor('slow');
  const done = signals.nodeSignals.find((s) => s.masteredAt)!;
  const node = nodeById.get(done.nodeId)!;
  assert.ok(struggleScore(done, node) >= HELP_THRESHOLD, 'this fixture is only useful if it scores high');
  assert.equal(shouldOfferHelp(done, node).offer, false);
});

test('the erratic learner is judged node by node, not labelled as a person', () => {
  const signals = signalsFor('erratic');
  const open = signals.nodeSignals
    .filter((s) => !s.masteredAt)
    .map((signal) => shouldOfferHelp(signal, nodeById.get(signal.nodeId)!).offer);

  assert.ok(open.includes(true), 'the nodes they are stuck on get a scaffold');
  assert.ok(open.includes(false), 'the nodes they breezed through do not');
});

test('a struggling learner is sent at a cheaper quest than a fast one', () => {
  // Same mastered set for everyone, so the only thing that varies is the
  // learner's pattern — otherwise this would be testing `deriveStatuses`.
  const mastered = [
    'logic-foundations', 'truth-tables', 'set-operations', 'proof-language',
    'direct-proofs', 'relations', 'functions',
  ];
  const top = (id: LearnerProfileId) => rankNextQuests(demoTree, mastered, signalsFor(id), 3)[0]!;

  const fast = top('fast');
  assert.equal(fast.id, 'combinatorics', 'a fast learner gets the node that opens the most of the tree');

  for (const id of ['slow', 'plateaued'] as const) {
    const quest = top(id);
    assert.equal(quest.id, 'induction', `${id} gets the smallest available win`);
    assert.ok(quest.xpReward < fast.xpReward, `${id} was sent somewhere cheaper than the fast learner`);
  }

  assert.deepEqual(
    rankNextQuests(demoTree, mastered, signalsFor('steady'), 3).map((n) => n.id),
    nextQuests(demoTree, mastered, 3).map((n) => n.id),
    'a steady learner keeps the order the instructor wrote',
  );
});

test('a brand-new learner gets defaults rather than a divide by zero', () => {
  const fresh: LearnerSignals = { nodeSignals: [], streakDays: 0, daysActive: 0 };

  assert.equal(learnerMode(demoTree, fresh), 'steady');
  assert.equal(paceTarget(fresh), DEFAULT_PACE);
  assert.deepEqual(
    rankNextQuests(demoTree, [], fresh, 2).map((n) => n.id),
    nextQuests(demoTree, [], 2).map((n) => n.id),
  );
});

test('a garbage signal scores zero rather than NaN', () => {
  const node = nodeById.get('recurrence')!;
  const junk: NodeSignal = {
    nodeId: 'recurrence',
    attempts: Number.NaN,
    msSpent: -1,
    hintsUsed: Number.POSITIVE_INFINITY,
    helpRequested: false,
  };
  const score = struggleScore(junk, node);
  assert.ok(Number.isFinite(score) && score >= 0 && score <= 1, `score was ${score}`);
});

test('the time term uses the node estimate when there is one', () => {
  const timed: SkillNode = { ...nodeById.get('recurrence')!, estimatedMinutes: 20 };
  const overran: NodeSignal = {
    nodeId: 'recurrence',
    attempts: 1,
    msSpent: 60 * 60_000, // three times the estimate: the time term saturates
    hintsUsed: 0,
    helpRequested: false,
  };
  assert.ok(Math.abs(struggleScore(overran, timed) - 0.35) < 1e-9);
});

test('the same seed gives the same learner twice', () => {
  for (const profile of ALL_PROFILES) {
    assert.deepEqual(
      generateSignals(profile, demoTree, SEED),
      generateSignals(profile, demoTree, SEED),
      `${profile.id} is not reproducible`,
    );
  }
  assert.notDeepEqual(
    generateSignals(LEARNER_PROFILES.steady, demoTree, SEED),
    generateSignals(LEARNER_PROFILES.steady, demoTree, SEED + 1),
    'a different seed has to actually move the numbers',
  );
});
