/**
 * Draw the app's icons from a hand-authored bitmap.
 *
 * The whole interface is built from bitmaps drawn on a grid and rendered as hard
 * pixels — see DESIGN.md. An app icon exported from a vector tool would be the
 * one image in the product that disagrees with that, and the antialiasing alone
 * would give it away at 48px. So the mark is authored here at 16x16 in the
 * locked palette and scaled by whole numbers only: every output pixel is exactly
 * one palette entry, and nothing is ever blended.
 *
 * No dependencies. PNG is a container around a zlib stream, `node:zlib` is in
 * the standard library, and pulling in a raster library to write four flat-
 * colour images would be more machinery than the format.
 *
 *   node scripts/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets');

/** From src/theme/tokens.ts. Keep in step with it by hand — there are five. */
const INK = {
  '.': null, // transparent
  V: '#0A0407', // void, the ground
  C: '#C4123F', // cardinal, an available node
  R: '#E8506B', // rose, its lit edge
  B: '#7E0A28', // blood, its shadowed edge
  G: '#C8A15A', // brass, a cleared node
  L: '#E8C87A', // gold, its lit edge
  U: '#3A2410', // umber, its shadowed edge
  S: '#5A4A55', // slate, the edges between nodes
};

/**
 * The product in sixteen rows: one node branching into two, one of them cleared.
 *
 * It is the chart, which is the thing this app is. A monogram would have been
 * easier and would have said nothing.
 */
const MARK = [
  '................',
  '................',
  '.....RRRRRR.....',
  '.....RCCCCB.....',
  '.....RCCCCB.....',
  '.....BBBBBB.....',
  '.......SS.......',
  '...SSSSSSSSSS...',
  '...S........S...',
  '...S........S...',
  '.LLLLLL..RRRRRR.',
  '.LGGGGU..RCCCCB.',
  '.LGGGGU..RCCCCB.',
  '.UUUUUU..BBBBBB.',
  '................',
  '................',
];

// ------------------------------------------------------------------- png

/** CRC-32, table built once. Fifteen lines rather than a dependency. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** `pixels` is width*height RGBA bytes. */
function png(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // compression, filter, interlace all 0 — the defaults, and the only values
  // every decoder is required to support.

  // Filter byte 0 (None) on every scanline. These are flat colour fields, so a
  // predictive filter would buy nothing and cost clarity.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const from = y * width * 4;
    pixels.copy(raw, y * (1 + width * 4) + 1, from, from + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function rgba(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    255,
  ];
}

/**
 * Render the mark at `size`, on `ground` (or transparent), with the mark
 * occupying `coverage` of the shorter edge.
 *
 * `scale` is floored to a whole number so a source pixel is always a whole
 * square of output pixels. A fractional scale is where the blurring would come
 * from, and this design has a rule against exactly that.
 */
function render({ size, ground, coverage }) {
  const grid = MARK.length;
  const scale = Math.max(1, Math.floor((size * coverage) / grid));
  const drawn = scale * grid;
  const offset = Math.floor((size - drawn) / 2);

  const pixels = Buffer.alloc(size * size * 4); // transparent by default
  if (ground) {
    const [r, g, b, a] = rgba(ground);
    for (let i = 0; i < size * size; i += 1) {
      pixels[i * 4] = r;
      pixels[i * 4 + 1] = g;
      pixels[i * 4 + 2] = b;
      pixels[i * 4 + 3] = a;
    }
  }

  for (let row = 0; row < grid; row += 1) {
    for (let col = 0; col < MARK[row].length; col += 1) {
      const hex = INK[MARK[row][col]];
      if (!hex) continue;
      const [r, g, b, a] = rgba(hex);
      for (let dy = 0; dy < scale; dy += 1) {
        const y = offset + row * scale + dy;
        if (y < 0 || y >= size) continue;
        for (let dx = 0; dx < scale; dx += 1) {
          const x = offset + col * scale + dx;
          if (x < 0 || x >= size) continue;
          const i = (y * size + x) * 4;
          pixels[i] = r;
          pixels[i + 1] = g;
          pixels[i + 2] = b;
          pixels[i + 3] = a;
        }
      }
    }
  }

  return png(size, size, pixels);
}

const FILES = [
  // The store icon: full bleed on the product's own ground.
  { name: 'icon.png', size: 1024, ground: INK.V, coverage: 0.72 },
  // Android masks this to whatever shape the launcher uses and only the middle
  // ~66% is guaranteed visible, so the mark is drawn smaller and the ground is
  // left to `adaptiveIcon.backgroundColor` in app.json.
  { name: 'adaptive-icon.png', size: 1024, ground: null, coverage: 0.46 },
  // Transparent, because the splash has two grounds: app.json sets cream in
  // light and void in dark. Baking either one in would show as a hard square of
  // the wrong colour on the other.
  { name: 'splash.png', size: 1024, ground: null, coverage: 0.5 },
  { name: 'favicon.png', size: 64, ground: INK.V, coverage: 0.75 },
];

mkdirSync(OUT, { recursive: true });
for (const file of FILES) {
  writeFileSync(join(OUT, file.name), render(file));
  console.log(`wrote assets/${file.name} (${file.size}x${file.size})`);
}
