import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterMissionRows,
  groupMissionRows,
  isMissionTitleCase,
  missionDifficulty,
  nextRecommendedMission,
  sortMissionRows,
  type MissionBoardRow,
} from './missionBoard.ts';
import type { Mission, SkillNode } from './types.ts';

function row(
  id: string,
  state: MissionBoardRow['state'],
  xpReward: number,
  estimatedMinutes: number | undefined,
  sortOrder: number,
  moduleName = 'Unit 1',
  difficulty?: Mission['difficulty'],
): MissionBoardRow {
  const node: SkillNode = {
    id: `node-${id}`, courseId: 'course', trackId: null, title: `Node ${id}`,
    description: '', kind: 'topic', xpReward, x: 0, y: 0, sortOrder, moduleName,
  };
  return {
    courseId: 'course', courseTitle: 'Course', courseOrder: 0, node, state,
    missionOrder: 0, missingPrerequisites: [],
    mission: {
      id, skillId: node.id, title: `Mission ${id}`, description: '', kind: 'topic',
      xpReward, estimatedMinutes, difficulty,
    },
  };
}

const ROWS = [
  row('a', 'open', 30, 45, 0, 'Unit 1', 'easy'),
  row('b', 'done', 80, 90, 1, 'Unit 1', 'hard'),
  row('c', 'locked', 50, 15, 2, 'Unit 2', 'medium'),
];

test('mission filters and sorting keep deterministic curriculum tie-breakers', () => {
  assert.deepEqual(filterMissionRows(ROWS, 'open').map((item) => item.mission.id), ['a']);
  assert.deepEqual(sortMissionRows(ROWS, 'xp').map((item) => item.mission.id), ['b', 'c', 'a']);
  assert.deepEqual(sortMissionRows(ROWS, 'duration').map((item) => item.mission.id), ['c', 'a', 'b']);
  assert.deepEqual(sortMissionRows(ROWS, 'difficulty').map((item) => item.mission.id), ['b', 'c', 'a']);
  assert.equal(nextRecommendedMission(ROWS)?.mission.id, 'a');
});

test('mission modules keep completion counts and course boundaries', () => {
  const groups = groupMissionRows(ROWS);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => [group.title, group.completed, group.total]), [
    ['Unit 1', 1, 2],
    ['Unit 2', 0, 1],
  ]);
});

test('difficulty inherits safely and mission title case permits connecting words', () => {
  assert.equal(missionDifficulty(ROWS[0]!.mission, ROWS[0]!.node), 'easy');
  assert.equal(isMissionTitleCase('Read the Chapter Opener'), true);
  assert.equal(isMissionTitleCase('read the Chapter Opener'), false);
  assert.equal(isMissionTitleCase('Read The Chapter Opener'), false);
});

test('legacy missions recover parser difficulty from their scaled XP', () => {
  const legacy = row('legacy-hard', 'open', 85, 30, 3);
  assert.equal(missionDifficulty(legacy.mission, legacy.node), 'hard');
});
