'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vendorApiClient as apiClient } from '@/lib/api/client';

export interface VendorProfile {
  id: string;
  businessName: string;
  description: string | null;
  addressLine: string;
  cityId: number;
  lat: number;
  lng: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  rejectionReason: string | null;
  availability: 'OPEN' | 'CLOSED' | 'BUSY';
  serviceRadiusKm: string;
  respondWithinMin: number;
  slotCapacity: number;
  ratingAvg: string;
  ratingCount: number;
}

export interface UpdateVendorProfileInput {
  businessName?: string;
  description?: string;
  serviceRadiusKm?: number;
  respondWithinMin?: number;
  slotCapacity?: number;
}

export const vendorProfileKey = ['vendor', 'profile'] as const;

export function useVendorProfile() {
  return useQuery({
    queryKey: vendorProfileKey,
    queryFn: async () => (await apiClient.get<VendorProfile>('/vendor/profile')).data,
  });
}

export function useUpdateVendorProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateVendorProfileInput) =>
      (await apiClient.patch<VendorProfile>('/vendor/profile', input)).data,
    onSuccess: (profile) => {
      queryClient.setQueryData(vendorProfileKey, profile);
    },
  });
}
