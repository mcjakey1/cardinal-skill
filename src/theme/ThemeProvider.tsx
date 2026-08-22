import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_THEME_ID,
  THEME_PRESETS,
  availableThemes,
  isThemePresetId,
  type ThemePalette,
  type ThemePresetId,
} from './themes';

const STORAGE_KEY = 'cardinal.theme-preset.v1';

interface AppThemeContextValue {
  theme: ThemePalette;
  currentThemeId: ThemePresetId;
  setThemeId: (id: ThemePresetId) => void;
  availableThemes: readonly ThemePalette[];
  ready: boolean;
}

const AppThemeContext = createContext<AppThemeContextValue>({
  theme: THEME_PRESETS[DEFAULT_THEME_ID],
  currentThemeId: DEFAULT_THEME_ID,
  setThemeId: () => {},
  availableThemes,
  ready: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentThemeId, setCurrentThemeId] = useState<ThemePresetId>(DEFAULT_THEME_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((storedId) => {
        if (live && isThemePresetId(storedId)) setCurrentThemeId(storedId);
      })
      .catch(() => {
        // A missing or unreadable preference falls back to Obsidian.
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const setThemeId = useCallback((id: ThemePresetId) => {
    setCurrentThemeId(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {
      // The selection remains useful for this session if storage is unavailable.
    });
  }, []);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      theme: THEME_PRESETS[currentThemeId],
      currentThemeId,
      setThemeId,
      availableThemes,
      ready,
    }),
    [currentThemeId, ready, setThemeId],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  return useContext(AppThemeContext);
}
