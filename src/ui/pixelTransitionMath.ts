export const PIXEL_WIPE_COLUMNS = 40;
export const PIXEL_WIPE_ROWS = 24;

export function pixelThreshold(column: number, row: number): number {
  const randomJitter = ((column * 73 + row * 151 + column * row * 17) % 997) / 996;
  return (column / PIXEL_WIPE_COLUMNS) * 0.7 + randomJitter * 0.3;
}

export function pixelVisible(progress: number, threshold: number): boolean {
  return progress < 0.5
    ? 2 * progress > threshold
    : 2 * (progress - 0.5) <= threshold;
}
