'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { discoveryQueryKeys } from '../queries';
import type { PublicVendorDetail, VendorCatalog } from '../types';

export function useVendorDetail(vendorId: string | undefined) {
  return useQuery({
    queryKey: discoveryQueryKeys.detail(vendorId ?? ''),
    queryFn: async () => {
      const result = await apiClient.get<PublicVendorDetail>(`/vendors/${vendorId}`);
      return result.data;
    },
    enabled: !!vendorId,
    staleTime: 1000 * 60 * 10,
  });
}

export function useVendorCatalog(vendorId: string | undefined) {
  return useQuery({
    queryKey: [...discoveryQueryKeys.detail(vendorId ?? ''), 'catalog'],
    queryFn: async () => {
      const result = await apiClient.get<VendorCatalog>(`/vendors/${vendorId}/catalog`);
      return result.data;
    },
    enabled: !!vendorId,
    staleTime: 1000 * 60 * 10,
  });
}
