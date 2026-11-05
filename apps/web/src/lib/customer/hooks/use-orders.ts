'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { orderQueryKeys } from '../queries';
import type { OrderDetailView, OrderSummaryView, OrderTimelineEntry } from '../types';

interface OrderListResponse {
  items: OrderSummaryView[];
  nextCursor: string | null;
}

export interface PlaceOrderInput {
  vendorId: string;
  addressId: string;
  items: { serviceItemId: string; qty: number }[];
  pickupSlotStart: string;
  deliverySlotStart: string;
  paymentMethod: 'COD';
  expectedTotal: string;
  customerNote?: string;
}

export function useOrders() {
  return useInfiniteQuery({
    queryKey: orderQueryKeys.list(),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const result = await apiClient.get<OrderListResponse>('/orders', { params: { cursor: pageParam } });
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 30,
  });
}

export function useOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: orderQueryKeys.detail(orderId ?? ''),
    queryFn: async () => {
      const result = await apiClient.get<OrderDetailView>(`/orders/${orderId}`);
      return result.data;
    },
    enabled: !!orderId,
    staleTime: 1000 * 15,
  });
}

export function useOrderTimeline(orderId: string | undefined) {
  return useQuery({
    queryKey: [...orderQueryKeys.detail(orderId ?? ''), 'timeline'],
    queryFn: async () => {
      const result = await apiClient.get<OrderTimelineEntry[]>(`/orders/${orderId}/timeline`);
      return result.data ?? [];
    },
    enabled: !!orderId,
  });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ idempotencyKey, ...input }: PlaceOrderInput & { idempotencyKey: string }) => {
      const result = await apiClient.post<OrderDetailView>('/orders', input, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}
