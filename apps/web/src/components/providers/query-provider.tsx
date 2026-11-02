'use client';

import { useState } from 'react';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isRetryableErrorCode } from '@dhoblio/shared';
import { BffError } from '@/lib/api/bff';

/**
 * Query defaults for an operations panel.
 *
 * Admin data is live data: a stale payout queue or dispatch board gets someone paid twice or a rider sent
 * to a job already done. So nothing is cached for long, and anything the admin is actually looking at
 * refetches when they come back to the tab.
 */
function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Only shout about a background refetch failure if we already have data on screen; the first
        // load renders its own error state, and two messages for one failure is noise.
        if (query.state.data === undefined) return;
        if (error instanceof BffError && error.isSessionExpired) return; // handled by the redirect below
        toast.error(error instanceof Error ? error.message : 'Could not refresh this view.');
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          if (error instanceof BffError) {
            // Never retry a 4xx the admin caused, and never retry past an expired session.
            return isRetryableErrorCode(error.code);
          }
          return true; // network blip
        },
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4_000),
      },
      mutations: {
        // A mutation is a deliberate act by a person: never retry it behind their back.
        retry: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(getQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
