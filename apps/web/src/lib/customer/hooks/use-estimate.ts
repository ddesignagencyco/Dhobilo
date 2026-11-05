'use client';

import { useQuery } from '@tanstack/react-query';
import type { Cart } from '@dhoblio/shared';
import { apiClient } from '@/lib/api/client';
import { checkoutQueryKeys } from '../queries';
import type { CartEstimate } from '../types';

export type { CartEstimate };

export function useEstimate(cart: Cart | null, vendorId?: string) {
  return useQuery({
    queryKey: checkoutQueryKeys.estimate(cart, vendorId),
    queryFn: async () => {
      if (!cart || !vendorId) return null;
      const result = await apiClient.post<CartEstimate>('/cart/estimate', {
        vendorId,
        items: cart.items.map((item) => ({ serviceItemId: item.itemId, qty: item.quantity })),
      });
      return result.data;
    },
    enabled: !!cart && cart.items.length > 0 && !!vendorId,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60,
  });
}
