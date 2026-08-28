import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_SCALE,
  MIN_SCALE,
  boundsOf,
  clampScale,
  fitTransform,
  toScreen,
  zoomAbout,
} from './chartViewport.ts';

const VIEWPORT = { width: 900, height: 600 };

test('bounds cover every point plus the padding asked for', () => {
  const b = boundsOf(
    [
      { x: 0, y: 0 },
      { x: 300, y: 120 },
    ],
    20,
  );

  assert.deepEqual(b, { minX: -20, minY: -20, maxX: 320, maxY: 140 });
});

test('an empty chart still has usable bounds rather than Infinity', () => {
  // Math.min of nothing is Infinity, which would poison every transform
  // downstream and render the canvas at a NaN offset.
  const b = boundsOf([], 20);

  assert.ok(Number.isFinite(b.minX) && Number.isFinite(b.maxX));
  assert.ok(b.maxX > b.minX && b.maxY > b.minY);
});

test('fit centres the content in the viewport', () => {
  const bounds = { minX: 0, minY: 0, maxX: 300, maxY: 200 };
  const t = fitTransform(bounds, VIEWPORT);

  // The centre of the content should land on the centre of the viewport.
  const centre = toScreen({ x: 150, y: 100 }, t);
  assert.ok(Math.abs(centre.x - VIEWPORT.width / 2) < 0.001, `x was ${centre.x}`);
  assert.ok(Math.abs(centre.y - VIEWPORT.height / 2) < 0.001, `y was ${centre.y}`);
});

test('content larger than the viewport is scaled down to fit', () => {
  const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 1200 };
  const t = fitTransform(bounds, VIEWPORT);

  assert.ok(t.scale < 1, `expected to shrink, got ${t.scale}`);
  const corner = toScreen({ x: 2000, y: 1200 }, t);
  assert.ok(corner.x <= VIEWPORT.width + 0.001, 'right edge inside the viewport');
  assert.ok(corner.y <= VIEWPORT.height + 0.001, 'bottom edge inside the viewport');
});

test('a chart too big to fit readably stops at the floor instead of fitting', () => {
  // Readability wins over showing everything. A whole-semester tree shrunk to
  // fit a phone is a page of unreadable specks, so fit stops at MIN_SCALE and
  // the rest is reached by panning — which is the point of an unbounded canvas.
  const t = fitTransform({ minX: 0, minY: 0, maxX: 9000, maxY: 6000 }, VIEWPORT);

  assert.equal(t.scale, MIN_SCALE);
});

test('fit never scales past the ceiling, however small the chart', () => {
  const t = fitTransform({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, VIEWPORT);

  assert.ok(t.scale <= MAX_SCALE, `${t.scale} exceeded ${MAX_SCALE}`);
});

test('a viewport with no size yet does not produce a NaN transform', () => {
  // The first render happens before onLayout has measured anything.
  const t = fitTransform({ minX: 0, minY: 0, maxX: 300, maxY: 200 }, { width: 0, height: 0 });

  assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.scale));
  assert.ok(t.scale > 0);
});

test('scale is clamped at both ends', () => {
  assert.equal(clampScale(99), MAX_SCALE);
  assert.equal(clampScale(0.0001), MIN_SCALE);
  assert.equal(clampScale(Number.NaN), 1);
});

test('zooming holds the point under the cursor still', () => {
  // The whole job of zoomAbout. Getting it wrong makes the chart slide away
  // from wherever you were looking, which is the classic pan/zoom bug.
  const before = { x: 40, y: 25, scale: 1 };
  const focus = { x: 500, y: 300 };

  const after = zoomAbout(before, 2, focus);

  const worldBefore = { x: (focus.x - before.x) / before.scale, y: (focus.y - before.y) / before.scale };
  const stillThere = toScreen(worldBefore, after);

  assert.ok(Math.abs(stillThere.x - focus.x) < 0.001, `x drifted to ${stillThere.x}`);
  assert.ok(Math.abs(stillThere.y - focus.y) < 0.001, `y drifted to ${stillThere.y}`);
});

test('zooming past the ceiling holds the focus point anyway', () => {
  // Once the scale clamps, the naive formula moves the chart even though the
  // zoom did nothing — so the clamp has to happen before the offset is solved.
  const before = { x: 0, y: 0, scale: MAX_SCALE };
  const focus = { x: 300, y: 200 };

  const after = zoomAbout(before, 4, focus);

  assert.equal(after.scale, MAX_SCALE);
  assert.deepEqual({ x: after.x, y: after.y }, { x: before.x, y: before.y });
});
