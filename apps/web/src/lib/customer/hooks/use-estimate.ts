'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { checkoutQueryKeys } from '../queries';
import type { Cart } from '@dhoblio/shared';

export interface Estimate {
  subtotal: string;
  deliveryFee: string;
  discount?: string;
  total: string;
}

export function useEstimate(cart: Cart | null, vendorId?: string) {
  return useQuery({
    queryKey: checkoutQueryKeys.estimate(cart, vendorId),
    queryFn: async () => {
      if (!cart || !vendorId) return null;
      const result = await apiClient.post<Estimate>('/cart/estimate', { vendorId, items: cart.items });
      return result.data;
    },
    enabled: !!cart && !!vendorId,
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60, // 1 minute
  });
}
