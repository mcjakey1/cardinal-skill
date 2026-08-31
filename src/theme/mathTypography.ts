import { Platform, type TextStyle } from 'react-native';

/** Math avoids the display pixel font so dense symbols retain clear spacing. */
export const equationText: TextStyle = {
  fontFamily: Platform.select({
    web: '"Courier New", ui-monospace, SFMono-Regular, Consolas, monospace',
    default: 'monospace',
  }),
  fontSize: 13,
  lineHeight: 20,
  letterSpacing: 0.5,
};
