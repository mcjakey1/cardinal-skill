/**
 * The material the skill tree is drawn on.
 *
 * `DitherField` is still the default and still the thing every other screen
 * uses; this adds the choices the chart alone offers — repeating patterns and a
 * picture of the student's own. The rules from `DESIGN.md` do not relax here:
 * patterns are whole palette entries on the 2dp cell, and a picture is dimmed
 * with a Bayer scrim rather than an alpha ramp.
 *
 * The preference itself lives in `@/theme/backdrops`.
 */

import { useEffect, useId, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import {
  PATTERN_TILE,
  patternCells,
  patternInk,
  type Backdrop as BackdropChoice,
  type PatternId,
} from '@/theme/backdrops';
import { ditherFill, instanceNamespace } from '@/theme/dither';
import { useAppTheme } from '@/theme/ThemeProvider';
import { DitherDefs, DitherField } from './Dither';

function isPatternId(id: BackdropChoice['id']): id is PatternId {
  return id in PATTERN_TILE;
}

interface Props {
  /**
   * Low-bandwidth mode: patterns collapse to their base colour and a wallpaper
   * held on a server is not fetched at all. A picture already on the device
   * still draws — it costs nothing to show.
   */
  flat?: boolean;
}

export function Backdrop({ flat = false }: Props) {
  const { theme, backdrop } = useAppTheme();
  // Two of these mount at once whenever the picker is open: the chart behind
  // the modal, and the preview inside it. Sharing a definition name meant
  // closing the picker took the chart's pattern with it.
  const scrimName = instanceNamespace('scrim', useId());
  const [broken, setBroken] = useState(false);

  // A new picture deserves a fresh attempt; a link can start working again.
  useEffect(() => setBroken(false), [backdrop.imageUri]);

  const remote = backdrop.imageUri?.startsWith('https:') ?? false;
  const showImage =
    backdrop.id === 'image' && Boolean(backdrop.imageUri) && !broken && !(flat && remote);

  if (showImage) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]} />
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: backdrop.imageUri! }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setBroken(true)}
        />
        {backdrop.dim > 0 ? (
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <DitherDefs name={scrimName} colour={theme.background} levels={[backdrop.dim]} />
            <Rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill={ditherFill(scrimName, backdrop.dim)}
            />
          </Svg>
        ) : null}
      </View>
    );
  }

  if (isPatternId(backdrop.id) && !flat) {
    return <PatternBackdrop id={backdrop.id} base={theme.background} ink={patternInk(theme)} />;
  }

  if (isPatternId(backdrop.id) && flat) {
    return (
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]}
        pointerEvents="none"
      />
    );
  }

  if (backdrop.id === 'gradient') {
    // `border` is the brightest of the palette's quiet tones, so it is the most
    // visible ramp available — and a ramp is the one thing here that covers the
    // whole canvas, so it cannot take the contrast the sparse patterns can
    // without fighting the nodes drawn on top of it.
    return <DitherField from={theme.background} to={theme.border} bands={11} flat={flat} />;
  }

  // `field`, and anything that fell through: the canvas as it was before this
  // setting existed.
  return <DitherField flat={flat} />;
}

function PatternBackdrop({ id, base, ink }: { id: PatternId; base: string; ink: string }) {
  const tile = PATTERN_TILE[id];
  const fillId = instanceNamespace('csk-pattern', useId());
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern
            id={fillId}
            patternUnits="userSpaceOnUse"
            width={tile}
            height={tile}
          >
            {patternCells(id).map((cell, index) => (
              <Rect
                key={index}
                x={cell.x}
                y={cell.y}
                width={cell.width}
                height={cell.height}
                fill={ink}
              />
            ))}
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={base} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${fillId})`} />
      </Svg>
    </View>
  );
}
