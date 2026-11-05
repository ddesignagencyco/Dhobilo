'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { OrderDeliveryLeg } from '@/lib/api/types';

export function useOrderDelivery(orderId: string | undefined) {
  return useQuery({
    queryKey: ['orders', orderId, 'delivery'],
    queryFn: async () => {
      const result = await apiClient.get<OrderDeliveryLeg[]>(`/orders/${orderId}/delivery`);
      return result.data;
    },
    enabled: !!orderId,
  });
}

export function useRiderLocation(orderId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['orders', orderId, 'rider-location'],
    queryFn: async () => {
      const result = await apiClient.get<{ jobType: string; lat: number; lng: number; updatedAt: string }>(`/orders/${orderId}/rider-location`);
      return result.data;
    },
    enabled: !!orderId && enabled,
  });
}
