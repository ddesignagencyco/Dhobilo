'use client';

import { useSyncExternalStore } from 'react';

/** True when the viewport matches `query`; false on the server and until the first client render. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's `lg` breakpoint, where the rider app switches to the sidebar + split-panel layout. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
