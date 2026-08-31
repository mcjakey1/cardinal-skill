import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  const [red = 0, green = 0, blue = 0] = channels;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function palette(source: string, exportName: string): Record<string, string> {
  const body = source.match(new RegExp(`export const ${exportName}[^=]*= \\{([\\s\\S]*?)\\n\\}`))?.[1];
  assert.ok(body, `${exportName} must remain a literal palette`);
  return Object.fromEntries(
    [...body.matchAll(/^\s*(\w+):\s*'(#[0-9a-f]{6})'/gim)].map((match) => [match[1], match[2]]),
  );
}

function assertReadable(name: string, colour: Record<string, string>): void {
  const pairs: [string, string, string][] = [
    ['primary text', 'ink', 'ground'],
    ['secondary text', 'inkMuted', 'ground'],
    ['primary button text', 'brandInk', 'brand'],
    ['brand text', 'brand', 'ground'],
    ['success text', 'ok', 'ground'],
    ['attention text', 'attention', 'ground'],
    ['gold text', 'goldInk', 'ground'],
  ];

  for (const [label, foreground, background] of pairs) {
    const foregroundHex = colour[foreground];
    const backgroundHex = colour[background];
    assert.ok(foregroundHex && backgroundHex, `${name} ${label} must use defined palette roles`);
    assert.ok(
      contrast(foregroundHex, backgroundHex) >= 4.5,
      `${name} ${label} must meet WCAG AA contrast`,
    );
  }
}

test('instructor light and dark palettes keep text at WCAG AA contrast', () => {
  const source = readFileSync('src/theme/lms.ts', 'utf8');
  assertReadable('light', palette(source, 'lmsLightColour'));
  assertReadable('dark', palette(source, 'lmsDarkColour'));
});
