import assert from 'node:assert/strict';
import test from 'node:test';

import { miniMapFrustum, miniMapGeometry, projectToMiniMap } from './minimap.ts';

test('minimap projection preserves letterbox offsets', () => {
  const geometry = miniMapGeometry([{ x: 0, y: 0 }, { x: 200, y: 100 }], 100, 100);
  assert.equal(geometry.offsetX, 0);
  assert.equal(geometry.offsetY, 25);
  assert.deepEqual(projectToMiniMap({ x: 100, y: 50 }, geometry), { x: 50, y: 50 });
});

test('frustum follows camera translation and inverse zoom', () => {
  const geometry = miniMapGeometry([{ x: 0, y: 0 }, { x: 200, y: 100 }], 100, 50);
  assert.deepEqual(
    miniMapFrustum({ x: -50, y: -25, scale: 2 }, { width: 100, height: 50 }, geometry),
    { x: 12.5, y: 6.25, width: 25, height: 12.5 },
  );
});
