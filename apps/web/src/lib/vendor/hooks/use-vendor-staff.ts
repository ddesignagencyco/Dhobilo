'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vendorApiClient as apiClient } from '@/lib/api/client';

export interface StaffMember {
  userId: string;
  phone: string;
  name: string | null;
  status: string;
  hasSignedIn: boolean;
}

const staffKey = ['vendor', 'staff'] as const;

export function useVendorStaff() {
  return useQuery({
    queryKey: staffKey,
    queryFn: async () => (await apiClient.get<StaffMember[]>('/vendor/staff')).data,
  });
}

export function useAddStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { phone: string; name?: string }) =>
      (await apiClient.post<StaffMember>('/vendor/staff', input)).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: staffKey }),
  });
}

export function useRemoveStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/vendor/staff/${userId}`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: staffKey }),
  });
}
