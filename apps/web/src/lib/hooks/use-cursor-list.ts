'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { bff } from '@/lib/api/bff';

/**
 * Every admin list on this API is cursor-paginated: pass `cursor`, get `meta.nextCursor` back, and there
 * is no total. So the UI is "load more", never numbered pages — a page number would need a count the
 * server does not provide, and faking one with offsets would drift as rows arrive.
 *
 * Page sizes stay small because the TRD targets 3G (§16.2).
 */

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function useCursorList<T>({
  key,
  path,
  query,
  limit = 25,
  enabled = true,
  refetchInterval,
}: {
  /** Stable query key. Include every filter, or changing a filter will show the previous list's rows. */
  key: unknown[];
  path: string;
  query?: Record<string, unknown>;
  limit?: number;
  enabled?: boolean;
  /** Set for boards that must stay live, e.g. dispatch. */
  refetchInterval?: number;
}) {
  const result = useInfiniteQuery({
    queryKey: key,
    enabled,
    refetchInterval,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data, meta } = await bff<T[]>(path, {
        query: { ...query, limit, cursor: pageParam },
        signal,
      });
      return {
        items: Array.isArray(data) ? data : [],
        nextCursor: (meta?.nextCursor as string | null | undefined) ?? null,
      } satisfies CursorPage<T>;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = result.data?.pages.flatMap((p) => p.items) ?? [];

  return {
    ...result,
    items,
    /** True on the very first load, when there is nothing to show yet. */
    isInitialLoading: result.isLoading,
    /** True while fetching a further page, so the button can show progress without blanking the table. */
    isLoadingMore: result.isFetchingNextPage,
  };
}
