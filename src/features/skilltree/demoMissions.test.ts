import assert from 'node:assert/strict';
import { test } from 'node:test';

import { demoMissions } from './demoMissions.ts';
import { demoCompletedMissionIds, demoMasteredIds, demoTree, demoXp } from './demoTree.ts';
import { nodeXpFromMissions } from './missions.ts';

test('every node in the demo chart is worth exactly the sum of its missions', () => {
  for (const node of demoTree.nodes) {
    assert.equal(
      nodeXpFromMissions(demoMissions, node.id),
      node.xpReward,
      `${node.id} is worth ${node.xpReward} but its missions add to ${nodeXpFromMissions(demoMissions, node.id)}`,
    );
  }
});

test('every mission belongs to a node that exists', () => {
  const known = new Set(demoTree.nodes.map((n) => n.id));
  for (const m of demoMissions) {
    assert.ok(known.has(m.skillId), `${m.id} belongs to unknown node ${m.skillId}`);
  }
});

test('mission ids are unique', () => {
  const ids = demoMissions.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('the showcase progress is internally consistent', () => {
  const knownMissionIds = new Set(demoMissions.map((mission) => mission.id));
  assert.ok(demoCompletedMissionIds.every((id) => knownMissionIds.has(id)));
  assert.ok(demoMasteredIds.every((id) => demoTree.nodes.some((node) => node.id === id)));
  assert.equal(
    demoMissions
      .filter((mission) => demoCompletedMissionIds.includes(mission.id))
      .reduce((total, mission) => total + mission.xpReward, 0),
    demoXp,
  );
});
