'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vendorApiClient as apiClient } from '@/lib/api/client';

export type Availability = 'OPEN' | 'CLOSED' | 'BUSY';

export interface HoursEntry {
  dayOfWeek: number;
  opensAt: number;
  closesAt: number;
}

export interface VendorProfile {
  id: string;
  businessName: string;
  description: string | null;
  status: string;
  availability: Availability;
  serviceRadiusKm: string;
  respondWithinMin: number;
  slotCapacity: number;
}

const profileKey = ['vendor', 'profile'] as const;
const hoursKey = ['vendor', 'hours'] as const;

export function useVendorProfile() {
  return useQuery({
    queryKey: profileKey,
    queryFn: async () => (await apiClient.get<VendorProfile>('/vendor/profile')).data,
  });
}

export function useVendorHours() {
  return useQuery({
    queryKey: hoursKey,
    queryFn: async () => (await apiClient.get<HoursEntry[]>('/vendor/hours')).data ?? [],
  });
}

export function useSetVendorHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (hours: HoursEntry[]) => (await apiClient.put<HoursEntry[]>('/vendor/hours', { hours })).data,
    onSuccess: (data) => queryClient.setQueryData(hoursKey, data),
  });
}

export function useSetAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (availability: Availability) =>
      (await apiClient.patch<{ id: string; availability: Availability }>('/vendor/availability', { availability }))
        .data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey }),
  });
}

export function useUpdateVendorProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { serviceRadiusKm?: number; respondWithinMin?: number; slotCapacity?: number }) =>
      (await apiClient.patch<VendorProfile>('/vendor/profile', input)).data,
    onSuccess: (data) => queryClient.setQueryData(profileKey, data),
  });
}
