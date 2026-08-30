import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ChartChangeSet } from './chartDiff.ts';
import { buildPublishPayload } from './publishPayload.ts';
import type { Mission, SkillNode } from './types.ts';

const EMPTY: ChartChangeSet = {
  insertNodes: [], updateNodes: [], archiveNodes: [], restoreNodes: [],
  deletePrereqs: [], insertPrereqs: [], upsertMissions: [], deleteMissions: [],
};

function node(id: string, extra: Partial<SkillNode> = {}): SkillNode {
  return {
    id, courseId: 'c', trackId: null, title: id, description: '',
    kind: 'topic', xpReward: 50, x: 1, y: 2, sortOrder: 3, ...extra,
  };
}

test('every section is present as an array even when nothing changed', () => {
  const payload = buildPublishPayload(EMPTY);

  for (const key of [
    'insert_nodes', 'update_nodes', 'archive_nodes', 'restore_nodes',
    'delete_prereqs', 'insert_prereqs', 'upsert_missions', 'delete_missions',
  ]) {
    assert.ok(Array.isArray((payload as unknown as Record<string, unknown>)[key]), `${key} is an array`);
  }
});

test('an inserted node carries snake_case columns and no course_id', () => {
  const payload = buildPublishPayload({ ...EMPTY, insertNodes: [node('n1', { iconKey: 'pixel_flask' })] });

  assert.deepEqual(payload.insert_nodes, [{
    id: 'n1', title: 'n1', description: '', kind: 'topic', xp_reward: 50,
    icon_key: 'pixel_flask', x: 1, y: 2, sort_order: 3, title_override: null,
  }]);
});

test('a mission worth zero estimated minutes sends null, because the check is > 0', () => {
  const mission: Mission = {
    id: 'm1', skillId: 'n1', title: 'Read', description: '',
    kind: 'topic', xpReward: 10, estimatedMinutes: 0,
  };
  const payload = buildPublishPayload({ ...EMPTY, upsertMissions: [mission] });

  assert.equal(payload.upsert_missions[0]?.estimated_minutes, null);
  assert.equal(payload.upsert_missions[0]?.node_id, 'n1', 'skillId is node_id in the database');
});

test('an edge carries only its two endpoints, because a trigger fills course_id', () => {
  const payload = buildPublishPayload({ ...EMPTY, insertPrereqs: [{ nodeId: 'b', prereqId: 'a' }] });

  assert.deepEqual(payload.insert_prereqs, [{ node_id: 'b', prereq_id: 'a' }]);
});

test('a blank title override is sent as null, not as an empty string', () => {
  const payload = buildPublishPayload({
    ...EMPTY, updateNodes: [node('n1', { titleOverride: '   ' } as Partial<SkillNode>)],
  });

  assert.equal(payload.update_nodes[0]?.title_override, null);
});
