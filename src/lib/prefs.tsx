/**
 * Screen preferences that outlive a session: theme, motion, bandwidth, and the
 * chart you were last looking at.
 *
 * Reduce-motion is read from the operating system first and only then from the
 * in-app switch, so a student who set it system-wide never has to find it here.
 * The switch can turn motion off, never back on against the OS.
 *
 * Theme works the other way round on purpose. The OS is the *default*, not the
 * ceiling: `system` follows the device, and `light` or `dark` overrides it. A
 * student reading in bed on a phone that never leaves light mode is allowed to
 * pin dark, which is exactly the case an OS-only rule would refuse.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Appearance } from 'react-native';

import type { Scheme } from '@/theme/tokens';

const KEY = 'cardinal.prefs.v1';

/** `system` defers to the device; the other two pin it. */
export type ThemeChoice = 'system' | Scheme;

/**
 * Which of the two surfaces this device is being used for.
 *
 * **Not authentication and not a permission.** Nothing is unlocked by it: every
 * figure an instructor screen shows still comes from a security-definer function
 * gated on `auth.uid()`, or from sample data labelled as sample data. All this
 * decides is which door was taken on the way in, so the nav bar can offer the
 * way back to the workspace instead of stranding a teacher in a student's app.
 */
export type Role = 'student' | 'instructor';

interface Stored {
  reduceMotion: boolean;
  lowBandwidth: boolean;
  lastCourseId: string | null;
  theme: ThemeChoice;
  role: Role | null;
}

const DEFAULTS: Stored = {
  reduceMotion: false,
  lowBandwidth: false,
  lastCourseId: null,
  theme: 'system',
  role: null,
};

interface Prefs extends Stored {
  /** True when either the OS or the in-app switch asks for it. */
  motionOff: boolean;
  /** What the screen actually draws in, once the choice and the device agree. */
  scheme: Scheme;
  set: <K extends keyof Stored>(key: K, value: Stored[K]) => void;
}

const PrefsContext = createContext<Prefs>({
  ...DEFAULTS,
  motionOff: false,
  scheme: 'light',
  set: () => {},
});

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useState<Stored>(DEFAULTS);
  const [osReduceMotion, setOsReduceMotion] = useState(false);
  const [osScheme, setOsScheme] = useState<Scheme>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (live && raw) setStored({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Stored>) });
      })
      .catch(() => {
        // A corrupt or unreadable preference file is not worth a visible error;
        // the defaults are a working app.
      });

    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setOsReduceMotion(on);
    });
    const motionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReduceMotion);
    const themeSub = Appearance.addChangeListener(({ colorScheme }) => {
      setOsScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });

    return () => {
      live = false;
      motionSub.remove();
      themeSub.remove();
    };
  }, []);

  const set = useCallback<Prefs['set']>((key, value) => {
    setStored((prev) => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<Prefs>(
    () => ({
      ...stored,
      motionOff: osReduceMotion || stored.reduceMotion,
      scheme: stored.theme === 'system' ? osScheme : stored.theme,
      set,
    }),
    [stored, osReduceMotion, osScheme, set],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  return useContext(PrefsContext);
}
