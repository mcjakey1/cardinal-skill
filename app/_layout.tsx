import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

import { palette } from '@/theme/tokens';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.ink },
          headerTintColor: palette.parchment,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: palette.ink },
        }}
      />
    </QueryClientProvider>
  );
}
