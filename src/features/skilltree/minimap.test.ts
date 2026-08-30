import assert from 'node:assert/strict';
import test from 'node:test';

import { miniMapGeometry, projectToMiniMap } from './minimap.ts';

test('minimap projection preserves letterbox offsets', () => {
  const geometry = miniMapGeometry([{ x: 0, y: 0 }, { x: 200, y: 100 }], 100, 100);
  assert.equal(geometry.offsetX, 0);
  assert.equal(geometry.offsetY, 25);
  assert.deepEqual(projectToMiniMap({ x: 100, y: 50 }, geometry), { x: 50, y: 50 });
});
