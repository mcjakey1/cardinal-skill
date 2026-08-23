import Svg, { Rect } from 'react-native-svg';

import { PIXEL_ICON_BITMAPS, type PixelIconKey } from '@/features/skilltree/pixelIcons';

export function SubjectPixelIcon({ icon, size = 24, colour }: {
  icon: PixelIconKey;
  size?: number;
  colour: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 8 8">
      {PIXEL_ICON_BITMAPS[icon].flatMap((row, y) =>
        [...row].map((pixel, x) => pixel === 'X'
          ? <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colour} />
          : null),
      )}
    </Svg>
  );
}
