'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { orderQueryKeys } from '../queries';
import { useCart } from '../cart-provider';
import type { OrderDetailView, OrderLiveEvent, OrderSummaryView, OrderTimelineEntry, ReorderResult } from '../types';

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
      const result = await apiClient.get<OrderSummaryView[]>('/orders', { params: { cursor: pageParam } });
      return { items: result.data, nextCursor: (result.meta?.nextCursor as string | null | undefined) ?? null } satisfies OrderListResponse;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 30,
  });
}

export function useOrderDetail(orderId: string | undefined, options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: orderQueryKeys.detail(orderId ?? ''),
    queryFn: async () => {
      const result = await apiClient.get<OrderDetailView>(`/orders/${orderId}`);
      return result.data;
    },
    enabled: !!orderId && (options?.enabled ?? true),
    staleTime: 1000 * 15,
    refetchInterval: options?.refetchInterval,
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

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason?: string }) => {
      const result = await apiClient.post<OrderDetailView>(`/orders/${orderId}/cancel`, { reason });
      return result.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: orderQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: [...orderQueryKeys.detail(variables.orderId), 'timeline'] });
    },
  });
}

export function useReorderOrder() {
  const queryClient = useQueryClient();
  const { clearCart, addItem } = useCart();
  return useMutation({
    mutationFn: async ({ orderId }: { orderId: string }) => {
      const result = await apiClient.post<ReorderResult>(`/orders/${orderId}/reorder`);
      return result.data;
    },
    onSuccess: (result, _variables) => {
      clearCart();
      for (const line of result.cart.items) {
        addItem(result.cart.vendorId, line.itemId, line.quantity);
      }
      void queryClient.invalidateQueries({ queryKey: orderQueryKeys.all });
    },
  });
}

export interface UseOrderTrackingResult {
  events: OrderLiveEvent[];
  last: OrderLiveEvent | null;
}

/**
 * Live order status over SSE through the customer BFF. The BFF attaches the customer's bearer token, which
 * browsers' EventSource cannot send, so the stream is read with fetch. Polling (see useOrderDetail) is the
 * fallback when the stream cannot be kept open.
 */
export function useOrderTracking(orderId: string | undefined, enabled: boolean) {
  const [events, setEvents] = useState<OrderLiveEvent[]>([]);
  const lastSeqRef = useRef<number | null>(null);

  useEffect(() => {
    if (!orderId || !enabled) return;

    const controller = new AbortController();
    let buffer = '';

    const read = async () => {
      const response = await fetch(`/api/customer/bff/orders/${orderId}/events`, {
        headers: {
          Accept: 'text/event-stream',
          ...(lastSeqRef.current ? { 'Last-Event-ID': String(lastSeqRef.current) } : {}),
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok || !response.body) throw new Error('Live order updates are unavailable.');

      const reader = response.body.getReader();
      const push = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += push.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const lines = block.split(/\r?\n/);
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('data:')) dataLines.push(line.slice(5));
          }
          if (dataLines.length === 0) continue;
          const parsed = JSON.parse(dataLines.join('\n')) as { type?: string; data?: OrderLiveEvent };
          if (parsed?.type !== 'status' || !parsed.data) continue;
          const event = parsed.data;
          if (event.seq <= (lastSeqRef.current ?? 0)) continue;
          lastSeqRef.current = event.seq;
          setEvents((previous) => [...previous.filter((entry) => entry.seq < event.seq), event]);
        }
      }
    };

    void read().catch(() => undefined);
    return () => controller.abort();
  }, [orderId, enabled]);

  const last = events.length > 0 ? (events[events.length - 1] ?? null) : null;
  return { events, last };
}
