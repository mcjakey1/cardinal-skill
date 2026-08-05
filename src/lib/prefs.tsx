/**
 * Screen preferences that outlive a session: motion, bandwidth, and the chart
 * you were last looking at.
 *
 * Reduce-motion is read from the operating system first and only then from the
 * in-app switch, so a student who set it system-wide never has to find it here.
 * The switch can turn motion off, never back on against the OS.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

const KEY = 'cardinal.prefs.v1';

interface Stored {
  reduceMotion: boolean;
  lowBandwidth: boolean;
  lastCourseId: string | null;
}

const DEFAULTS: Stored = { reduceMotion: false, lowBandwidth: false, lastCourseId: null };

interface Prefs extends Stored {
  /** True when either the OS or the in-app switch asks for it. */
  motionOff: boolean;
  set: <K extends keyof Stored>(key: K, value: Stored[K]) => void;
}

const PrefsContext = createContext<Prefs>({ ...DEFAULTS, motionOff: false, set: () => {} });

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
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReduceMotion);

    return () => {
      live = false;
      sub.remove();
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
    () => ({ ...stored, motionOff: osReduceMotion || stored.reduceMotion, set }),
    [stored, osReduceMotion, set],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  return useContext(PrefsContext);
}
