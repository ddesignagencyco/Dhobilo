'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vendorApiClient as apiClient } from '@/lib/api/client';

export const SERVICE_TYPES = ['WASH_FOLD', 'WASH_IRON', 'DRY_CLEAN', 'IRON_ONLY', 'OTHER'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export interface ServiceCategory {
  id: number;
  name: string;
  nameUr: string | null;
}

export interface VendorCatalogItem {
  id: string;
  categoryId: number;
  category: ServiceCategory;
  itemName: string;
  itemNameUr: string | null;
  serviceType: ServiceType;
  price: string;
  turnaroundHours: number;
  isActive: boolean;
}

export interface CatalogItemInput {
  categoryId: number;
  itemName: string;
  itemNameUr?: string;
  serviceType: ServiceType;
  price: number;
  turnaroundHours: number;
  isActive?: boolean;
}

export interface ImportRowInput {
  itemName: string;
  itemNameUr?: string;
  category: string;
  serviceType: string;
  price: number;
  turnaroundHours: number;
  isActive?: boolean;
}

const catalogKey = ['vendor', 'catalog'] as const;

export function useCatalogItems() {
  return useQuery({
    queryKey: catalogKey,
    queryFn: async () => (await apiClient.get<VendorCatalogItem[]>('/vendor/catalog/items')).data ?? [],
  });
}

export function useServiceCategories() {
  return useQuery({
    queryKey: ['vendor', 'service-categories'],
    queryFn: async () => (await apiClient.get<ServiceCategory[]>('/service-categories')).data ?? [],
    staleTime: 1000 * 60 * 60,
  });
}

export function useCreateCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: CatalogItemInput) =>
      (await apiClient.post<VendorCatalogItem>('/vendor/catalog/items', item)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKey }),
  });
}

export function useUpdateCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...item }: Partial<CatalogItemInput> & { id: string }) =>
      (await apiClient.patch<VendorCatalogItem>(`/vendor/catalog/items/${id}`, item)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKey }),
  });
}

export function useDeleteCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/vendor/catalog/items/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKey }),
  });
}

export function useBulkImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (items: ImportRowInput[]) =>
      (
        await apiClient.post<{
          created: number;
          updated: number;
          total: number;
        }>('/vendor/catalog/import', { items })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKey }),
  });
}
