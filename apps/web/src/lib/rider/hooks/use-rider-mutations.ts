'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface RiderJobUpdateInput {
  status: 'IN_TRANSIT' | 'COMPLETED' | 'FAILED';
  proofType?: 'PHOTO' | 'OTP';
  proofValue?: string;
  notes?: string;
}

interface RiderJobAcceptInput {
  jobId: string;
}

interface RiderStatusToggleInput {
  online: boolean;
}

interface RiderRegistrationInput {
  cnic: string;
  cnicPhoto: string;
  profilePhoto: string;
  bankAccount?: {
    iban: string;
    accountHolder: string;
  };
}

const riderQueryKeys = {
  all: ['rider'] as const,
  jobs: () => [...riderQueryKeys.all, 'jobs'] as const,
  earnings: () => [...riderQueryKeys.all, 'earnings'] as const,
};

export function useRiderJobUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, ...input }: RiderJobUpdateInput & { jobId: string }) => {
      const result = await apiClient.post(`/rider/jobs/${jobId}/update`, input);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: riderQueryKeys.jobs() });
      void queryClient.invalidateQueries({ queryKey: riderQueryKeys.earnings() });
    },
  });
}

export function useRiderJobAccept() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId }: RiderJobAcceptInput) => {
      const result = await apiClient.post(`/rider/jobs/${jobId}/accept`, {});
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: riderQueryKeys.jobs() });
    },
  });
}

export function useRiderStatusToggle() {
  return useMutation({
    mutationFn: async ({ online }: RiderStatusToggleInput) => {
      const result = await apiClient.post('/rider/status', { online });
      return result.data;
    },
  });
}

export function useRiderRegistration() {
  return useMutation({
    mutationFn: async (input: RiderRegistrationInput) => {
      const result = await apiClient.post('/rider/register', input);
      return result.data;
    },
  });
}
