import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '@/auth/AuthContext';
import { fetchAccountBackdrop, saveAccountBackdrop } from '@/lib/canvasPreferences';
import { DEFAULT_BACKDROP, parseBackdrop, type Backdrop } from './backdrops';
import {
  DEFAULT_THEME_ID,
  THEME_PRESETS,
  availableThemes,
  isThemePresetId,
  type ThemePalette,
  type ThemePresetId,
} from './themes';
import { ThemeWebStyle } from './ThemeWebStyle';

const STORAGE_KEY = 'cardinal.theme-preset.v1';

/**
 * The palette is a property of the screen and is shared by everyone using this
 * device. The backdrop is not: it can be a photo out of one student's camera
 * roll, so its cache is scoped to whoever chose it.
 */
function backdropKey(owner: string | null): string {
  return owner ? `cardinal.backdrop.v1:${owner}` : 'cardinal.backdrop.v1';
}

interface AppThemeContextValue {
  theme: ThemePalette;
  currentThemeId: ThemePresetId;
  setThemeId: (id: ThemePresetId) => void;
  /**
   * What the skill tree canvas is drawn on. Kept with the signed-in account, so
   * it follows a student between their phone, their tablet, and the web; a demo
   * session keeps it on the device it was chosen on.
   */
  backdrop: Backdrop;
  setBackdrop: (next: Backdrop) => void;
  availableThemes: readonly ThemePalette[];
  ready: boolean;
}

const AppThemeContext = createContext<AppThemeContextValue>({
  theme: THEME_PRESETS[DEFAULT_THEME_ID],
  currentThemeId: DEFAULT_THEME_ID,
  setThemeId: () => {},
  backdrop: DEFAULT_BACKDROP,
  setBackdrop: () => {},
  availableThemes,
  ready: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const onAccount = session?.source === 'supabase';
  // Who the device copy belongs to. A backdrop can be a photo the student
  // chose, so the cache is theirs and not the handset's: without this, the next
  // person to sign in on a shared laptop opens the chart on someone else's
  // picture and it stays there until the account answers.
  const owner = session?.email ?? null;
  const [currentThemeId, setCurrentThemeId] = useState<ThemePresetId>(DEFAULT_THEME_ID);
  const [backdrop, setBackdropState] = useState<Backdrop>(DEFAULT_BACKDROP);
  const [ready, setReady] = useState(false);
  // The account is the source of truth, and it can answer before the disk does.
  // Without this the slower device read lands second and undoes it.
  const accountAnswered = useRef(false);

  useEffect(() => {
    let live = true;
    accountAnswered.current = false;
    AsyncStorage.multiGet([STORAGE_KEY, backdropKey(owner)])
      .then(([storedTheme, storedBackdrop]) => {
        if (!live) return;
        const id = storedTheme?.[1];
        if (isThemePresetId(id)) setCurrentThemeId(id);
        if (accountAnswered.current) return;
        setBackdropState(storedBackdrop?.[1] ? parseBackdrop(storedBackdrop[1]) : DEFAULT_BACKDROP);
      })
      .catch(() => {
        // A missing or unreadable preference falls back to Obsidian on the
        // field the chart has always drawn.
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [owner]);

  // The device copy paints first so the chart is never blank while a request is
  // in flight; the account's answer replaces it when it lands. Signing out
  // leaves the last backdrop in place rather than snapping the screen back.
  useEffect(() => {
    if (!onAccount) return;
    let live = true;
    fetchAccountBackdrop().then((stored) => {
      if (!live || !stored) return;
      accountAnswered.current = true;
      setBackdropState(stored);
      AsyncStorage.setItem(backdropKey(owner), JSON.stringify(stored)).catch(() => {});
    });
    return () => {
      live = false;
    };
  }, [onAccount, owner]);

  const setThemeId = useCallback((id: ThemePresetId) => {
    setCurrentThemeId(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {
      // The selection remains useful for this session if storage is unavailable.
    });
  }, []);

  const setBackdrop = useCallback(
    (next: Backdrop) => {
      // Re-checked on the way in as well as on the way out: the picker hands
      // over a link a person typed.
      const checked = parseBackdrop(next);
      setBackdropState(checked);
      // A deliberate choice outranks whatever the account is about to say, so
      // an answer still in flight must not land on top of it.
      accountAnswered.current = true;
      AsyncStorage.setItem(backdropKey(owner), JSON.stringify(checked)).catch(() => {
        // The canvas still changes for this session if storage is unavailable.
      });
      // The device copy is the one that has to succeed. The account copy is
      // what makes the choice show up on the student's other devices, and it
      // can fail quietly — the next change tries again.
      if (onAccount) void saveAccountBackdrop(checked);
    },
    [onAccount, owner],
  );

  const value = useMemo<AppThemeContextValue>(
    () => ({
      theme: THEME_PRESETS[currentThemeId],
      currentThemeId,
      setThemeId,
      backdrop,
      setBackdrop,
      availableThemes,
      ready,
    }),
    [backdrop, currentThemeId, ready, setBackdrop, setThemeId],
  );

  return (
    <AppThemeContext.Provider value={value}>
      <ThemeWebStyle theme={value.theme} />
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppThemeContextValue {
  return useContext(AppThemeContext);
}
