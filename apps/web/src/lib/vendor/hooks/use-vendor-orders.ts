'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export function useVendorOrders(status?: string) {
  return useQuery({
    queryKey: ['vendor', 'orders', status],
    queryFn: async () => {
      const params = status ? { status } : {};
      const response = await apiClient.get('/vendor/orders', { params });
      return response.data ?? [];
    },
  });
}

export function useVendorOrderCounts() {
  return useQuery({
    queryKey: ['vendor', 'orders', 'counts'],
    queryFn: async () => {
      const response = await apiClient.get('/vendor/orders/counts');
      return response.data;
    },
  });
}

export function useAcceptOrder(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data?: { reason?: string }) => {
      return apiClient.post(`/vendor/orders/${orderId}/accept`, data ?? {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', 'orders'] });
    },
  });
}

export function useRejectOrder(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { reason: string }) => {
      return apiClient.post(`/vendor/orders/${orderId}/reject`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', 'orders'] });
    },
  });
}

export function useUpdateOrderStatus(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (status: string) => {
      return apiClient.post(`/vendor/orders/${orderId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', 'orders'] });
    },
  });
}
