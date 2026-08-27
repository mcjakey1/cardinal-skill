import assert from 'node:assert/strict';
import test from 'node:test';

import { getLeaderboardLadderRanks } from './recordLadder.ts';

test('the below-podium ladder always exposes open ranks through 10', () => {
  assert.deepEqual(getLeaderboardLadderRanks(2, []), [4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(getLeaderboardLadderRanks(Number.NaN, [Number.NaN]), [4, 5, 6, 7, 8, 9, 10]);
});

test('the ladder follows the class size and caps the public list at rank 50', () => {
  assert.equal(getLeaderboardLadderRanks(14, [4, 12]).at(-1), 14);
  assert.equal(getLeaderboardLadderRanks(80, [51]).at(-1), 50);
});
