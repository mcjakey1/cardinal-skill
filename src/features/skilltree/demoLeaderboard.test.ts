import assert from 'node:assert/strict';
import test from 'node:test';

import { demoLeaderboard } from './demoLeaderboard.ts';
import { levelForXp } from './progression.ts';

test('demo leaderboard is a complete fictional ten-place ladder', () => {
  assert.deepEqual(demoLeaderboard.map((entry) => entry.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(demoLeaderboard.filter((entry) => entry.isCurrentUser).length, 1);
  assert.ok(demoLeaderboard.every((entry) => entry.participantCount === demoLeaderboard.length));
  assert.ok(demoLeaderboard.every((entry) => entry.level === levelForXp(entry.xp)));
});
