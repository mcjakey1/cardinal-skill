import assert from 'node:assert/strict';
import test from 'node:test';

import { finalizeMissionDrafts, missionDraftTotal, type MissionDraft } from './missionEditing.ts';

const drafts: MissionDraft[] = [
  { id: 'a', skillId: 'node', title: ' First task ', description: '', kind: 'topic', xpReward: '35' },
  { id: 'b', skillId: 'node', title: '', description: '', kind: 'topic', xpReward: '65' },
];

test('mission draft rewards determine the live node total', () => {
  assert.equal(missionDraftTotal(drafts), 100);
  assert.equal(missionDraftTotal([{ ...drafts[0]!, xpReward: '-20' }]), 0);
  assert.equal(missionDraftTotal([{ ...drafts[0]!, xpReward: '99999' }]), 10000);
});

test('finalizing mission drafts trims titles and normalizes rewards', () => {
  const missions = finalizeMissionDrafts(drafts);
  assert.equal(missions[0]?.title, 'First task');
  assert.equal(missions[1]?.title, 'Untitled mission');
  assert.deepEqual(missions.map((mission) => mission.xpReward), [35, 65]);
});
