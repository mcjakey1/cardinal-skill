import { createContext, useCallback, useContext, useMemo, useRef } from 'react';

import type { Transform } from './chartViewport';

interface CanvasViewportStore {
  read: (key: string) => Transform | undefined;
  write: (key: string, viewport: Transform) => void;
}

const CanvasViewportContext = createContext<CanvasViewportStore | null>(null);

/** Keeps each chart camera alive while routes and bottom tabs mount and unmount. */
export function CanvasViewportProvider({ children }: { children: React.ReactNode }) {
  const viewports = useRef(new Map<string, Transform>());
  const read = useCallback((key: string) => viewports.current.get(key), []);
  const write = useCallback((key: string, viewport: Transform) => {
    viewports.current.set(key, viewport);
  }, []);
  const value = useMemo(() => ({ read, write }), [read, write]);

  return (
    <CanvasViewportContext.Provider value={value}>{children}</CanvasViewportContext.Provider>
  );
}

export function useCanvasViewport(): CanvasViewportStore {
  const store = useContext(CanvasViewportContext);
  if (!store) throw new Error('useCanvasViewport must be used inside CanvasViewportProvider.');
  return store;
}
