/*
 * DIRECTION CONTRACT — Cardinal Skill, student app
 *
 * THESIS: A course is a sixteen-colour screen you are clearing. Refuses the
 *   ed-tech dashboard of rounded cards, a progress ring and a Continue row.
 * OWN-WORLD: Curated dark presets over one semantic grid; square 2dp edges,
 *   DotGothic16 on an 8px cell system, titled windows, and 8x8 bitmap icons.
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DotGothic16_400Regular, useFonts } from '@expo-google-fonts/dotgothic16';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, usePathname, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { PrefsProvider } from '@/lib/prefs';
import { ThemeProvider, useAppTheme } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme/useTheme';
import { NavBar } from '@/ui/NavBar';
import { PixelTransitionProvider } from '@/ui/PixelTransition';
import { CanvasViewportProvider } from '@/features/skilltree/CanvasViewportProvider';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { DEMO_COURSE_ID } from '@/features/skilltree/demoTree';

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
const BARE_ROUTES = ['/', '/upload', '/instructor'];

/**
 * Keys left behind by screens that no longer exist.
 *
 * `cardinal.author.v1` held the standalone by-hand builder's node rows. That
 * screen created a second, unrelated course instead of editing the one it was
 * opened from, so it is gone and the chart canvas does the job; its draft would
 * otherwise sit on every device that ever opened it with nothing left to read
 * it. Removing a key that is already absent is a no-op, so this can stay until
 * the install base has turned over.
 */
const RETIRED_KEYS = ['cardinal.author.v1'];

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      // Mounted routes stay warm through their active observers. Once a route
      // is genuinely evicted, release its records instead of retaining every
      // course visited for the lifetime of the browser tab.
      queries: { gcTime: 10 * 60 * 1000 },
    },
  }));
  const [loaded, error] = useFonts({ DotGothic16_400Regular });

  // Native holds behind the splash screen until the face is ready, because a
  // few hundred milliseconds of system font is a different design. Web has no
  // splash: gating there renders a blank page where a prerendered document
  // should be, so it paints immediately on the fallback stack `+html.tsx` sets
  // and swaps the face in when it lands.
  if (!loaded && !error && Platform.OS !== 'web') return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <PrefsProvider>
              <ThemeProvider>
                <CanvasViewportProvider>
                  <PixelTransitionProvider>
                    <Shell fontsReady={loaded || Boolean(error)} />
                  </PixelTransitionProvider>
                </CanvasViewportProvider>
              </ThemeProvider>
            </PrefsProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell({ fontsReady }: { fontsReady: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready: authReady, session } = useAuth();
  const bare = !session || BARE_ROUTES.includes(pathname);
  const t = useTheme();
  const { theme, ready: themeReady } = useAppTheme();

  useEffect(() => {
    if (fontsReady && themeReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady, themeReady]);

  useEffect(() => {
    AsyncStorage.multiRemove(RETIRED_KEYS).catch(() => {});
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!session && pathname !== '/') {
      router.replace('/');
    } else if (session && pathname === '/') {
      router.replace(session.role === 'instructor'
        ? '/instructor'
        : { pathname: '/tree/[courseId]', params: { courseId: DEMO_COURSE_ID } });
    }
  }, [authReady, pathname, router, session]);

  // Hold app content until persistence resolves so a saved palette never
  // appears after a one-frame flash of the default.
  if (!fontsReady || !themeReady || !authReady) return null;
  if ((!session && pathname !== '/') || (session && pathname === '/')) return null;

  return (
    <View style={{ flex: 1, backgroundColor: t.ground }}>
      {/* The status bar takes the opposite of the ground it sits on, so the
          clock stays legible in either theme rather than assuming a dark one. */}
      <StatusBar style="light" backgroundColor={theme.hudBackground} />
      {/* The default document title. Screens override it with their own
          <Head>; on native this renders nothing. */}
      <Head>
        <title>Cardinal Skill</title>
        <meta name="theme-color" content={theme.hudBackground} />
      </Head>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.ground },
          animation: 'none',
          // Stack routes remain mounted by default; freezing the inactive tree
          // preserves its graph, camera, and SVG DOM without background renders.
          freezeOnBlur: true,
        }}
      />
      {bare ? null : <NavBar />}
    </View>
  );
}
