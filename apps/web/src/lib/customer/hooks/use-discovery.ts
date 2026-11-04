'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { discoveryQueryKeys } from '../queries';

export type DiscoveryFilters = {
  serviceType?: string;
  minRating?: number;
  maxPrice?: number;
  sortBy?: 'distance' | 'rating' | 'price';
};

interface VendorCard {
  id: string;
  name: string;
  rating?: number;
  ratingCount?: number;
  distance?: number;
  minPrice?: string;
  openNow: boolean;
}

interface DiscoveryResponse {
  vendors: VendorCard[];
  meta?: {
    nextCursor?: string | null;
  };
}

export function useDiscovery(filters: DiscoveryFilters = {}) {
  return useInfiniteQuery({
    queryKey: discoveryQueryKeys.list(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const params: Record<string, unknown> = { ...filters };
      if (pageParam) params.cursor = pageParam;

      const result = await apiClient.get<DiscoveryResponse>('/vendors', { params });
      return result.data;
    },
    getNextPageParam: (lastPage) => (lastPage.meta?.nextCursor as string | undefined) ?? undefined,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
