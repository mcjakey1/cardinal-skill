/**
 * The resolved theme for the screen being drawn.
 *
 * One hook, so no screen ever decides for itself what "the background" is. The
 * preference is three-way — follow the device, or pin light, or pin dark —
 * because a student whose phone is already on a schedule should not have to set
 * this twice, and a student who wants paper at midnight should be allowed it.
 */

import { useMemo } from 'react';

import { useAppTheme } from './ThemeProvider';
import { toLegacyTheme } from './themes';
import type { Theme } from './tokens';

export function useTheme(): Theme {
  const { theme } = useAppTheme();
  return useMemo(() => toLegacyTheme(theme), [theme]);
}
