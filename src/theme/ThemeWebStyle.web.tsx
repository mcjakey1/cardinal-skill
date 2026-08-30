import { useEffect } from 'react';

import type { ThemePalette } from './themes';
import { webThemeVariables } from './webThemeVariables';

export function ThemeWebStyle({ theme }: { theme: ThemePalette }) {
  useEffect(() => {
    const root = document.documentElement;
    const variables = webThemeVariables(theme);

    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value);
    }
  }, [theme]);

  return null;
}
