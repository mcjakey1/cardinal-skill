import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKDROP_IDS,
  BACKDROP_LABELS,
  DEFAULT_BACKDROP,
  MAX_ACCOUNT_URI,
  MAX_IMAGE_URI,
  PATTERN_TILE,
  approximateBytes,
  checkImageUri,
  describeSize,
  imageLimitFor,
  parseBackdrop,
  patternCells,
  patternInk,
  type PatternId,
} from './backdrops.ts';
import { contrast } from './contrast.ts';
import { availableThemes } from './themes.ts';

test('every backdrop has picker copy', () => {
  for (const id of BACKDROP_IDS) {
    assert.equal(typeof BACKDROP_LABELS[id], 'string');
    assert.ok(BACKDROP_LABELS[id]!.length > 0);
  }
});

test('accepts only pictures that travel with the account', () => {
  for (const uri of [
    'https://example.edu/wall.png',
    '  https://example.edu/wall.png  ',
    'data:image/png;base64,AAAA',
  ]) {
    assert.equal(checkImageUri(uri).ok, true, uri);
  }
  const trimmed = checkImageUri('  https://example.edu/wall.png  ');
  assert.equal(trimmed.ok && trimmed.uri, 'https://example.edu/wall.png');
});

test('refuses anything unsafe, or pinned to one device', () => {
  for (const uri of [
    '',
    '   ',
    'javascript:alert(1)',
    'http://example.edu/wall.png',
    'data:text/html,<script>',
    'ftp://example.edu/wall.png',
    'file:///var/mobile/pic.jpg',
    'content://media/external/images/1',
    'ph://ABC-123',
    'blob:http://localhost:8081/abc',
  ]) {
    assert.equal(checkImageUri(uri).ok, false, uri);
  }
  assert.equal(checkImageUri(`data:image/png;base64,${'A'.repeat(MAX_IMAGE_URI)}`).ok, false);
});

test('a broken stored preference still draws a canvas', () => {
  assert.deepEqual(parseBackdrop(null), DEFAULT_BACKDROP);
  assert.deepEqual(parseBackdrop('not json'), DEFAULT_BACKDROP);
  assert.deepEqual(parseBackdrop({ id: 'nope' }), DEFAULT_BACKDROP);
  // Chose the image backdrop, but the stored link is no longer usable.
  assert.deepEqual(parseBackdrop({ id: 'image', imageUri: 'javascript:1', dim: 4 }), {
    id: DEFAULT_BACKDROP.id,
    imageUri: null,
    dim: 4,
  });
});

test('reads a good preference back, clamping the scrim', () => {
  const stored = JSON.stringify({ id: 'image', imageUri: 'https://example.edu/w.png', dim: 99 });
  assert.deepEqual(parseBackdrop(stored), {
    id: 'image',
    imageUri: 'https://example.edu/w.png',
    dim: 16,
  });
  assert.equal(parseBackdrop({ id: 'grid', dim: -3 }).dim, 0);
  assert.equal(parseBackdrop({ id: 'grid', dim: 5.6 }).dim, 6);
});

test('every pattern tiles on the 2dp cell grid without spilling', () => {
  for (const id of Object.keys(PATTERN_TILE) as PatternId[]) {
    const tile = PATTERN_TILE[id];
    const cells = patternCells(id);
    assert.ok(cells.length > 0, id);
    for (const cell of cells) {
      for (const value of [cell.x, cell.y, cell.width, cell.height]) {
        assert.equal(value % 2, 0, `${id} is off the 2dp grid`);
      }
      assert.ok(cell.x + cell.width <= tile, `${id} spills horizontally`);
      assert.ok(cell.y + cell.height <= tile, `${id} spills vertically`);
    }
  }
});

// The bug this pair of tests exists for: the first cut drew every pattern in
// `theme.border` on a dot every 16dp. It was correct SVG and an empty screen.

test('every pattern covers enough of its tile to be seen', () => {
  for (const id of Object.keys(PATTERN_TILE) as PatternId[]) {
    const tile = PATTERN_TILE[id];
    const lit = patternCells(id).reduce((sum, cell) => sum + cell.width * cell.height, 0);
    const coverage = lit / (tile * tile);
    assert.ok(coverage >= 0.05, `${id} covers ${(coverage * 100).toFixed(1)}% of its tile`);
    assert.ok(coverage <= 0.4, `${id} covers ${(coverage * 100).toFixed(1)}% and reads as a fill`);
  }
});

test('the web gets a smaller ceiling than a device', () => {
  const web = imageLimitFor('web');
  const native = imageLimitFor('native');
  assert.ok(web < native, 'localStorage is the smaller store, and counts UTF-16');
  // Two bytes per character there, in an origin budget of roughly five megabytes
  // that this app also keeps its session, prefs and course cache in.
  assert.ok(web * 2 < 5_000_000 / 2, 'a picture should not claim half the origin');

  const photo = `data:image/jpeg;base64,${'A'.repeat(web + 1)}`;
  assert.equal(checkImageUri(photo, web).ok, false);
  assert.equal(checkImageUri(photo, native).ok, true);
});

test('a picture stored on one device still displays on the other', () => {
  // Picked on a phone, under the device ceiling, synced down to the browser.
  // Reading it back must not apply the web's stricter picking limit, or the
  // account's choice would vanish on the very device it travelled to.
  const fromPhone = `data:image/jpeg;base64,${'A'.repeat(imageLimitFor('web') + 5000)}`;
  assert.equal(parseBackdrop({ id: 'image', imageUri: fromPhone, dim: 4 }).id, 'image');
});

test('every picking ceiling stays inside what the account row allows', () => {
  // Migration 0014 bounds the row. If a picking limit ever passes this, the
  // student gets a check violation nobody surfaces instead of a refusal.
  for (const platform of ['web', 'native'] as const) {
    assert.ok(imageLimitFor(platform) < MAX_ACCOUNT_URI, `${platform} exceeds the row`);
  }
});

test('a refusal states the size in the units a student thinks in', () => {
  const tooBig = `data:image/jpeg;base64,${'A'.repeat(1_000_000)}`;
  const refused = checkImageUri(tooBig, imageLimitFor('web'));
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.match(refused.reason, /\d/, 'the reason should carry real numbers');
  // Base64 spends four characters on three bytes, so the figure quoted is the
  // photo's actual weight and not its encoded length.
  assert.ok(approximateBytes(tooBig) < 1_000_000);
  assert.equal(describeSize(2_400_000), '2.4 MB');
  assert.equal(describeSize(525_000), '525 KB');
});

test('pattern ink clears the background on every preset', () => {
  for (const preset of availableThemes) {
    const ratio = contrast(patternInk(preset), preset.background);
    assert.ok(ratio >= 3, `${preset.name} draws patterns at ${ratio.toFixed(2)}:1`);
  }
});
