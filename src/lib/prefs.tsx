/**
 * Screen preferences that outlive a session: motion, bandwidth, role, and the
 * chart you were last looking at. Theme persistence lives in ThemeProvider so
 * palette hydration can finish before the student shell paints.
 *
 * Reduce-motion is read from the operating system first and only then from the
 * in-app switch, so a student who set it system-wide never has to find it here.
 * The switch can turn motion off, never back on against the OS.
 *
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

const KEY = 'cardinal.prefs.v1';

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
  instructorDarkMode: boolean;
  lastCourseId: string | null;
  role: Role | null;
}

const DEFAULTS: Stored = {
  reduceMotion: false,
  lowBandwidth: false,
  instructorDarkMode: false,
  lastCourseId: null,
  role: null,
};

interface Prefs extends Stored {
  /** True when either the OS or the in-app switch asks for it. */
  motionOff: boolean;
  set: <K extends keyof Stored>(key: K, value: Stored[K]) => void;
}

const PrefsContext = createContext<Prefs>({
  ...DEFAULTS,
  motionOff: false,
  set: () => {},
});

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useState<Stored>(DEFAULTS);
  const [osReduceMotion, setOsReduceMotion] = useState(false);

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
    return () => {
      live = false;
      motionSub.remove();
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
      set,
    }),
    [stored, osReduceMotion, set],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  return useContext(PrefsContext);
}
