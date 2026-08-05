/**
 * Is there room for a second column?
 *
 * One number, asked as a question about the space rather than about the device.
 * A phone in landscape and a narrow browser window are the same problem, and
 * "is this a tablet" is not answerable and not the thing being decided.
 *
 * `useWindowDimensions` rather than a CSS media query on purpose: this codebase
 * renders through react-native-web, so a media query would work on the web build
 * and silently do nothing on iOS and Android. One rule, one implementation.
 */

import { useWindowDimensions } from 'react-native';

/**
 * Below this the chart needs the whole width and the detail window docks to the
 * bottom edge. Above it there is room for the window to sit beside the chart
 * without either becoming unreadable — the chart's cells are 44dp and its labels
 * wrap at 14 characters, so squeezing it under about 420dp starts truncating
 * every label on screen.
 */
export const WIDE_AT = 720;

/** Width the docked detail window takes on a wide screen. */
export const DOCK_WIDTH = 360;

export function useWide(): boolean {
  return useWindowDimensions().width >= WIDE_AT;
}
