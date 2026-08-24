/**
 * WCAG relative luminance and contrast, on the `#RRGGBB` strings the palettes
 * are written in.
 *
 * It lives in the source rather than in one test file because two of them now
 * hold the palette to a floor — text against its ground, and a backdrop pattern
 * against the canvas it is drawn on.
 */

export function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}
