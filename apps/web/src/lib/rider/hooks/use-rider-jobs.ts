'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface DeliveryJob {
  id: string;
  orderId: string;
  type: 'PICKUP' | 'DROP';
  pickupAddress: {
    street: string;
    city: string;
    lat: number;
    lng: number;
  };
  dropAddress: {
    street: string;
    city: string;
    lat: number;
    lng: number;
  };
  customerPhone: string;
  customerName: string;
  status: 'UNASSIGNED' | 'ASSIGNED' | 'IN_TRANSIT' | 'COMPLETED' | 'FAILED';
  assignedAt: string | null;
  createdAt: string;
}

export interface AvailableJobsResponse {
  jobs: DeliveryJob[];
}

const riderQueryKeys = {
  all: ['rider'] as const,
  jobs: () => [...riderQueryKeys.all, 'jobs'] as const,
  job: (jobId: string) => [...riderQueryKeys.jobs(), jobId] as const,
  earnings: () => [...riderQueryKeys.all, 'earnings'] as const,
};

export function useRiderAvailableJobs(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: riderQueryKeys.jobs(),
    queryFn: async () => {
      const result = await apiClient.get<AvailableJobsResponse>('/rider/jobs/available');
      return result.data.jobs;
    },
    enabled: options?.enabled ?? true,
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 20,
  });
}

export function useRiderJob(jobId: string | undefined) {
  return useQuery({
    queryKey: riderQueryKeys.job(jobId ?? ''),
    queryFn: async () => {
      const result = await apiClient.get<DeliveryJob>(`/rider/jobs/${jobId}`);
      return result.data;
    },
    enabled: !!jobId,
    staleTime: 1000 * 15,
  });
}

export interface RiderEarnings {
  todayEarnings: number;
  weekEarnings: number;
  totalEarnings: number;
  completedJobs: number;
  pendingJobs: number;
}

export function useRiderEarnings() {
  return useQuery({
    queryKey: riderQueryKeys.earnings(),
    queryFn: async () => {
      const result = await apiClient.get<RiderEarnings>('/rider/earnings');
      return result.data;
    },
    staleTime: 1000 * 30,
  });
}
