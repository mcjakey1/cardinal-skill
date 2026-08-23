import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PIXEL_WIPE_COLUMNS,
  PIXEL_WIPE_ROWS,
  pixelThreshold,
  pixelVisible,
} from './pixelTransitionMath.ts';

test('pixel wipe thresholds stay in range and cover every cell at the midpoint', () => {
  for (let column = 0; column < PIXEL_WIPE_COLUMNS; column += 1) {
    for (let row = 0; row < PIXEL_WIPE_ROWS; row += 1) {
      const threshold = pixelThreshold(column, row);
      assert.ok(threshold >= 0 && threshold < 1);
      assert.equal(pixelVisible(0.5, threshold), true);
      assert.equal(pixelVisible(1, threshold), false);
    }
  }
});

test('the dissolve advances predominantly from left to right', () => {
  const left = Array.from({ length: PIXEL_WIPE_ROWS }, (_, row) => pixelThreshold(0, row));
  const right = Array.from(
    { length: PIXEL_WIPE_ROWS },
    (_, row) => pixelThreshold(PIXEL_WIPE_COLUMNS - 1, row),
  );
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(mean(left) < mean(right));
});
