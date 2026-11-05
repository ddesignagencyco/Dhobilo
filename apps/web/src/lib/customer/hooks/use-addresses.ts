'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { Address } from '../types';

export const addressQueryKeys = {
  all: ['addresses'] as const,
  list: () => [...addressQueryKeys.all, 'list'] as const,
};

export interface AddressInput {
  label?: string;
  line1: string;
  line2?: string;
  area?: string;
  cityId: number;
  lat: number;
  lng: number;
  isDefault?: boolean;
}

export function useAddresses() {
  return useQuery({
    queryKey: addressQueryKeys.list(),
    queryFn: async () => {
      const result = await apiClient.get<Address[]>('/me/addresses');
      return result.data ?? [];
    },
    staleTime: 1000 * 60,
  });
}

export function useCreateAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddressInput) => {
      const result = await apiClient.post<Address>('/me/addresses', input);
      return result.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: addressQueryKeys.list() }),
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/me/addresses/${id}`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: addressQueryKeys.list() }),
  });
}
