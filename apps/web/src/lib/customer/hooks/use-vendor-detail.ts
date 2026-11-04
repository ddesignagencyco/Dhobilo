'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { discoveryQueryKeys } from '../queries';

interface CatalogItem {
  id: string;
  nameEn: string;
  nameUr: string;
  category: string;
  price: string;
  turnaroundHours: number;
  active: boolean;
}

interface VendorDetail {
  id: string;
  name: string;
  rating?: number;
  ratingCount?: number;
  serviceRadiusKm: number;
  openNow: boolean;
  hours?: {
    [day: string]: {
      start: string;
      end: string;
      closed: boolean;
    };
  };
  catalog?: {
    [category: string]: CatalogItem[];
  };
  deliveryFee?: string;
}

export function useVendorDetail(vendorId: string) {
  return useQuery({
    queryKey: discoveryQueryKeys.detail(vendorId),
    queryFn: async () => {
      const result = await apiClient.get<VendorDetail>(`/vendors/${vendorId}`);
      return result.data;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}
