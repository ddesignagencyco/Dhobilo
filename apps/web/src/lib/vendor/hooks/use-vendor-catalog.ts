'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogItem } from '@dhoblio/shared';
import { apiClient } from '@/lib/api/client';

export function useCatalogItems() {
  return useQuery({
    queryKey: ['vendor', 'catalog'],
    queryFn: async () => {
      const response = await apiClient.get('/vendor/catalog/items');
      return response.data ?? [];
    },
  });
}

export function useCreateCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: CatalogItem) => {
      const response = await apiClient.post('/vendor/catalog/items', item);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', 'catalog'] });
    },
  });
}

export function useUpdateCatalogItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<CatalogItem>) => {
      const response = await apiClient.patch(`/vendor/catalog/items/${id}`, item);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', 'catalog'] });
    },
  });
}

export function useDeleteCatalogItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/vendor/catalog/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', 'catalog'] });
    },
  });
}

export function useBulkImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { items: CatalogItem[] }) => {
      const response = await apiClient.post('/vendor/catalog/import', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', 'catalog'] });
    },
  });
}
