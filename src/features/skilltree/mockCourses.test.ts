import assert from 'node:assert/strict';
import test from 'node:test';

import { nodeXpFromMissions } from './missions.ts';
import { MOCK_COURSES } from './mockCourses.ts';
import { validateGraph } from './validation.ts';

test('mock subjects ship valid graphs with clean mission pricing', () => {
  assert.deepEqual(MOCK_COURSES.map((course) => course.id), ['demo-cs201', 'demo-cpe102', 'demo-chem210']);
  for (const course of MOCK_COURSES) {
    assert.equal(validateGraph(course.tree.nodes, course.tree.prereqs).isValid, true, course.title);
    for (const node of course.tree.nodes) {
      assert.equal(nodeXpFromMissions(course.missions, node.id), node.xpReward, `${course.id}:${node.id}`);
    }
  }
});
