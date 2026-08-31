import { useMemo } from 'react';

import { usePrefs } from '@/lib/prefs';
import { lmsTheme, type LmsTheme } from './lms';

/** Instructor-only palette preference; the student theme remains untouched. */
export function useLmsTheme(): LmsTheme {
  const { instructorDarkMode } = usePrefs();
  return useMemo(
    () => lmsTheme(instructorDarkMode ? 'dark' : 'light'),
    [instructorDarkMode],
  );
}
