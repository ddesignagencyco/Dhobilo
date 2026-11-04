'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export function useVendorEarnings(range: 'day' | 'week' | 'month' = 'day') {
  return useQuery({
    queryKey: ['vendor', 'earnings', range],
    queryFn: async () => {
      const response = await apiClient.get('/vendor/earnings', { params: { range } });
      return response.data;
    },
  });
}

export function useVendorLedger(page = 1) {
  return useQuery({
    queryKey: ['vendor', 'ledger', page],
    queryFn: async () => {
      const response = await apiClient.get('/vendor/ledger', { params: { page } });
      return response.data;
    },
  });
}
