/*
 * DIRECTION CONTRACT — Cardinal Skill, student app
 *
 * THESIS: A course is a sixteen-colour screen you are clearing. Refuses the
 *   ed-tech dashboard of rounded cards, a progress ring and a Continue row.
 * OWN-WORLD: Locked sixteen-index palette led by cardinal #C4123F; every
 *   intermediate tone is a 4x4 Bayer dither of two entries, never a blend; 2dp
 *   bevels lit top-left; DotGothic16 on a cell grid; titled windows; icons
 *   authored as 8x8 bitmaps.
 * STORY: The student sees what is open now, taps the lit cell, reads what it is
 *   worth, marks it complete, and watches the chart open.
 * FIRST VIEWPORT: Full-bleed dithered cardinal field carrying the chart; course
 *   name and level, XP and streak as marginalia over it; a docked window at the
 *   bottom; a four-cell nav bar at the edge.
 * FORM: Sixteen-Colour Field, a dealt challenger taken over assigned candidate
 *   5 (Departures); seed key 074148ac.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, and DESIGN.md.
 */

import { DotGothic16_400Regular, useFonts } from '@expo-google-fonts/dotgothic16';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PrefsProvider } from '@/lib/prefs';
import { useTheme } from '@/theme/useTheme';
import { NavBar } from '@/ui/NavBar';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or the module is unavailable on this platform. Neither is
  // worth failing a launch over.
});

/**
 * Screens that are not part of the four-cell world and get no nav bar.
 *
 * `/instructor` is the instructor workspace, which is a different design with a
 * rail of its own (`src/theme/lms.ts`). Two navigations on one screen is one
 * navigation too many, so the pixel bar stays off it.
 */
const BARE_ROUTES = ['/', '/upload', '/author', '/instructor'];

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [loaded, error] = useFonts({ DotGothic16_400Regular });

  useEffect(() => {
    // The whole interface is set in one face. Showing it in the system font
    // first would be a different design for a few hundred milliseconds, so the
    // splash holds until the face is ready — or until loading it has failed,
    // because a missing font must not be a screen nobody can leave.
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  // Native holds behind the splash screen until the face is ready, because a
  // few hundred milliseconds of system font is a different design. Web has no
  // splash: gating there renders a blank page where a prerendered document
  // should be, so it paints immediately on the fallback stack `+html.tsx` sets
  // and swaps the face in when it lands.
  if (!loaded && !error && Platform.OS !== 'web') return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PrefsProvider>
          <Shell />
        </PrefsProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const pathname = usePathname();
  const bare = BARE_ROUTES.includes(pathname);
  const t = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: t.ground }}>
      {/* The status bar takes the opposite of the ground it sits on, so the
          clock stays legible in either theme rather than assuming a dark one. */}
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      {/* The default document title. Screens override it with their own
          <Head>; on native this renders nothing. */}
      <Head>
        <title>Cardinal Skill</title>
      </Head>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.ground },
          animation: 'fade',
        }}
      />
      {bare ? null : <NavBar />}
    </View>
  );
}
