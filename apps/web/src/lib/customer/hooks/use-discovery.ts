'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { discoveryQueryKeys } from '../queries';
import type { VendorCard } from '../types';

export type DiscoveryFilters = {
  cityId?: number;
  q?: string;
  serviceType?: string;
  minRating?: number;
  maxPrice?: number;
  sortBy?: 'distance' | 'rating' | 'price';
};

interface DiscoveryResult {
  items: VendorCard[];
  nextCursor: string | null;
}

export function useDiscovery(lat: number, lng: number, filters: DiscoveryFilters = {}) {
  const { sortBy = 'distance', ...rest } = filters;

  return useInfiniteQuery({
    queryKey: discoveryQueryKeys.list({ lat, lng, ...rest, sort: sortBy }),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const result = await apiClient.get<DiscoveryResult>('/vendors', {
        params: { lat, lng, sort: sortBy, ...rest, cursor: pageParam },
      });
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Number.isFinite(lat) && Number.isFinite(lng),
    staleTime: 1000 * 60 * 5,
  });
}
