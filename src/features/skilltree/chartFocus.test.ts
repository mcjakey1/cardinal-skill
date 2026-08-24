import assert from 'node:assert/strict';
import { test } from 'node:test';

import { currentFocusNodes } from './chartFocus.ts';
import { focusTransform, toScreen } from './chartViewport.ts';

const nodes = [
  { id: 'root' },
  { id: 'active-a' },
  { id: 'active-b' },
  { id: 'recommended' },
];

test('camera focus keeps every concurrently active node in the section', () => {
  const status = new Map(nodes.map((node) => [node.id, 'available']));
  const focused = currentFocusNodes(
    nodes,
    status,
    { 'active-a': 0.25, 'active-b': 0.75 },
    'recommended',
  );
  assert.deepEqual(focused.map((node) => node.id), ['active-a', 'active-b']);
});

test('camera focus falls back to one recommended node when nothing is underway', () => {
  const status = new Map(nodes.map((node) => [node.id, 'available']));
  const focused = currentFocusNodes(nodes, status, {}, 'recommended');
  assert.deepEqual(focused.map((node) => node.id), ['recommended']);
});

test('focused content is centred without excessive single-node zoom', () => {
  const viewport = { width: 1200, height: 800 };
  const transform = focusTransform(
    { minX: 450, minY: 250, maxX: 650, maxY: 450 },
    viewport,
  );
  const centre = toScreen({ x: 550, y: 350 }, transform);

  assert.equal(transform.scale, 1.15);
  assert.deepEqual(centre, { x: 600, y: 400 });
});
