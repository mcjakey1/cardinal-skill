import assert from 'node:assert/strict';
import test from 'node:test';

import { groupOutlineByModule } from './courseOutlineGroups.ts';
import type { OutlineEntry } from './courseOutline.ts';

function entry(id: string, moduleName: string | undefined, status: OutlineEntry['status']): OutlineEntry {
  return {
    position: Number(id),
    status,
    node: {
      id, moduleName, courseId: 'course', trackId: null, title: `Node ${id}`,
      description: '', kind: 'topic', xpReward: 20, x: 0, y: 0, sortOrder: Number(id),
    },
  };
}

test('outline modules preserve syllabus order and count mastered nodes', () => {
  const groups = groupOutlineByModule([
    entry('1', 'Module 1', 'mastered'),
    entry('2', 'Module 1', 'available'),
    entry('3', 'Module 2', 'locked'),
  ]);
  assert.deepEqual(groups.map((group) => [group.title, group.mastered, group.entries.map((row) => row.node.id)]), [
    ['Module 1', 1, ['1', '2']],
    ['Module 2', 0, ['3']],
  ]);
});

test('nodes without module metadata remain navigable in a fallback group', () => {
  const [group] = groupOutlineByModule([entry('1', undefined, 'available')]);
  assert.equal(group?.title, 'Course skills');
  assert.equal(group?.entries.length, 1);
});
