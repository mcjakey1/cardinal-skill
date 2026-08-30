import type { NodeKind } from './types';

export type PixelIconKey =
  | 'pixel_dice'
  | 'pixel_coin'
  | 'pixel_grid'
  | 'pixel_bar_chart'
  | 'pixel_trophy'
  | 'pixel_boss_skull'
  | 'pixel_cursor_arrow'
  | 'pixel_brackets'
  | 'pixel_scroll'
  | 'pixel_spellbook'
  | 'pixel_binary_tree'
  | 'pixel_pointer'
  | 'pixel_chip'
  | 'pixel_circuit'
  | 'pixel_gate'
  | 'pixel_potion'
  | 'pixel_flask'
  | 'pixel_atom';

export const PIXEL_ICON_KEYS: readonly PixelIconKey[] = [
  'pixel_dice', 'pixel_coin', 'pixel_grid', 'pixel_bar_chart', 'pixel_trophy',
  'pixel_boss_skull', 'pixel_cursor_arrow', 'pixel_brackets', 'pixel_scroll',
  'pixel_spellbook', 'pixel_binary_tree', 'pixel_pointer', 'pixel_chip',
  'pixel_circuit', 'pixel_gate', 'pixel_potion', 'pixel_flask', 'pixel_atom',
];

export function resolvePixelIcon(input: {
  iconKey?: PixelIconKey | null;
  title: string;
  description?: string;
  kind: NodeKind;
}): PixelIconKey {
  if (input.iconKey && PIXEL_ICON_KEYS.includes(input.iconKey)) return input.iconKey;
  const words = `${input.title} ${input.description ?? ''}`.toLowerCase();
  if (/midterm|final|exam|assessment/.test(words)) return 'pixel_trophy';
  if (/probability|chance|random|odds/.test(words)) return 'pixel_dice';
  if (/data|sampling|array|matrix|table/.test(words)) return 'pixel_grid';
  if (/chart|distribution|histogram|statistics/.test(words)) return 'pixel_bar_chart';
  if (/pointer|cursor|reference/.test(words)) return 'pixel_cursor_arrow';
  if (/code|program|syntax|function|algorithm/.test(words)) return 'pixel_brackets';
  if (input.kind === 'project') return 'pixel_boss_skull';
  if (input.kind === 'reading') return 'pixel_scroll';
  return 'pixel_spellbook';
}

/** Eight rows of eight pixels; X means the current semantic icon colour. */
export const PIXEL_ICON_BITMAPS: Record<PixelIconKey, readonly string[]> = {
  pixel_dice: ['........','.XXXXXX.','.X....X.','.X.X..X.','.X....X.','.X..X.X.','.XXXXXX.','........'],
  pixel_coin: ['...XX...','..X..X..','.X.XX.X.','.X.XX.X.','.X.XX.X.','.X....X.','..X..X..','...XX...'],
  pixel_grid: ['.XXXXXX.','.X.X..X.','.XXXXXX.','.X.X..X.','.XXXXXX.','.X.X..X.','.XXXXXX.','........'],
  pixel_bar_chart: ['........','.....XX.','..XX.XX.','..XX.XX.','.XXX.XX.','.XXX.XX.','.XXXXXX.','........'],
  pixel_trophy: ['.XXXXXX.','XX.XX.XX','XX.XX.XX','.XXXXXX.','...XX...','..XXXX..','...XX...','..XXXX..'],
  pixel_boss_skull: ['..XXXX..','.XXXXXX.','XX.XX.XX','XXXXXXXX','XX.XX.XX','.XXXXXX.','..X..X..','..X..X..'],
  pixel_cursor_arrow: ['.X......','.XX.....','.XXX....','.XXXX...','.XXXXX..','.XXX....','.X.XX...','...XX...'],
  pixel_brackets: ['.XXX.XXX','.X.....X','.X.....X','.X.....X','.X.....X','.X.....X','.XXX.XXX','........'],
  pixel_scroll: ['..XXXX..','.X....X.','.XXXXXX.','.X....X.','.X....X.','.XXXXXX.','..XXXX..','........'],
  pixel_spellbook: ['........','.XXX.XXX','X..XX..X','X..XX..X','X..XX..X','X..XX..X','.XXX.XXX','........'],
  pixel_binary_tree: ['...XX...','...XX...','..XXXX..','.XX..XX.','XX....XX','XX....XX','........','........'],
  pixel_pointer: ['.X......','.XX.....','.XXX....','.XXXX...','.XXXXX..','.XXX....','.X.XX...','...XX...'],
  pixel_chip: ['..X..X..','.XXXXXX.','XX....XX','.X.XX.X.','.X.XX.X.','XX....XX','.XXXXXX.','..X..X..'],
  pixel_circuit: ['XX....XX','.X.XX.X.','..XXXX..','XXX..XXX','XXX..XXX','..XXXX..','.X.XX.X.','XX....XX'],
  pixel_gate: ['........','.XXXX...','XX...X..','XX....X.','XX....X.','XX...X..','.XXXX...','........'],
  pixel_potion: ['...XX...','...XX...','..XXXX..','..X..X..','.X.XX.X.','.XXXXXX.','.XXXXXX.','..XXXX..'],
  pixel_flask: ['..X..X..','..X..X..','..X..X..','.X....X.','.X.XX.X.','X.XXXX.X','XXXXXXXX','.XXXXXX.'],
  pixel_atom: ['...XX...','.XX..XX.','X..XX..X','.XXXXXX.','.XXXXXX.','X..XX..X','.XX..XX.','...XX...'],
};
