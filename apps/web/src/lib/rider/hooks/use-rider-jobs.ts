"use client";

import { useQuery } from "@tanstack/react-query";
import { riderApiClient as apiClient } from "@/lib/api/client";

export type JobStatus =
  | "UNASSIGNED"
  | "ASSIGNED"
  | "ACCEPTED"
  | "IN_TRANSIT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface JobParty {
  role: "CUSTOMER" | "VENDOR";
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
}

export interface DeliveryJob {
  id: string;
  jobType: "PICKUP" | "DROP";
  status: JobStatus;
  order: { id: string; orderNo: string; status: string };
  scheduledStart: string;
  scheduledEnd: string;
  riderFee: string;
  currency: string;
  from: JobParty;
  to: JobParty;
  offerExpiresAt: string | null;
  proof: {
    required: boolean;
    types: ("OTP" | "PHOTO")[];
    used: "OTP" | "PHOTO" | null;
  };
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  nextActions: string[];
  distanceKm?: number;
}

export interface RiderProfile {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  cityId: number;
  isOnline: boolean;
  photoUrl: string | null;
  rejectionReason: string | null;
  name: string;
  phone: string;
  activeJobs: number;
  maxActiveJobs: number;
  today: { day: string | null; jobs: number; earned: string };
}

export interface RiderApplication {
  id: string;
  status: RiderProfile["status"];
  rejectionReason: string | null;
  createdAt: string;
  approvedAt: string | null;
}

export interface RiderEarnings {
  from: string;
  to: string;
  currency: string;
  days: { day: string; jobs: number; earned: string }[];
  totals: { jobs: number; earned: string };
}

export interface RiderCod {
  cashInHand: string;
  unsettledOrders: number;
  collections: {
    id: string;
    orderId: string;
    orderNo: string;
    amount: string;
    collectedAt: string;
    settled: boolean;
    settlementId: string | null;
  }[];
}

export interface City {
  id: number;
  name: string;
  nameUr: string | null;
}

export const riderQueryKeys = {
  all: ["rider"] as const,
  me: () => [...riderQueryKeys.all, "me"] as const,
  application: () => [...riderQueryKeys.all, "application"] as const,
  jobs: () => [...riderQueryKeys.all, "jobs"] as const,
  available: () => [...riderQueryKeys.jobs(), "available"] as const,
  mine: () => [...riderQueryKeys.jobs(), "mine"] as const,
  job: (jobId: string) => [...riderQueryKeys.jobs(), "one", jobId] as const,
  earnings: (from?: string, to?: string) =>
    [...riderQueryKeys.all, "earnings", from ?? "", to ?? ""] as const,
  cod: () => [...riderQueryKeys.all, "cod"] as const,
  cities: () => [...riderQueryKeys.all, "cities"] as const,
};

export function useRiderMe() {
  return useQuery({
    queryKey: riderQueryKeys.me(),
    queryFn: async () => (await apiClient.get<RiderProfile>("/rider/me")).data,
    staleTime: 1000 * 15,
    retry: false,
  });
}

export function useRiderApplication() {
  return useQuery({
    queryKey: riderQueryKeys.application(),
    queryFn: async () =>
      (await apiClient.get<RiderApplication>("/rider/status")).data,
    retry: false,
  });
}

export function useRiderAvailableJobs(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: riderQueryKeys.available(),
    queryFn: async () =>
      (await apiClient.get<DeliveryJob[]>("/rider/jobs/available")).data,
    enabled: options?.enabled ?? true,
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 20,
  });
}

export function useRiderMyJobs() {
  return useQuery({
    queryKey: riderQueryKeys.mine(),
    queryFn: async () =>
      (
        await apiClient.get<DeliveryJob[]>("/rider/jobs", {
          params: { view: "active" },
        })
      ).data,
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 20,
  });
}

export function useRiderJob(jobId: string | undefined) {
  return useQuery({
    queryKey: riderQueryKeys.job(jobId ?? ""),
    queryFn: async () =>
      (await apiClient.get<DeliveryJob>(`/rider/jobs/${jobId}`)).data,
    enabled: !!jobId,
    staleTime: 1000 * 15,
  });
}

export function useRiderEarnings(range?: { from: string; to: string }) {
  return useQuery({
    queryKey: riderQueryKeys.earnings(range?.from, range?.to),
    queryFn: async () =>
      (await apiClient.get<RiderEarnings>("/rider/earnings", { params: range }))
        .data,
    staleTime: 1000 * 30,
  });
}

export function useRiderCod() {
  return useQuery({
    queryKey: riderQueryKeys.cod(),
    queryFn: async () => (await apiClient.get<RiderCod>("/rider/cod")).data,
    staleTime: 1000 * 30,
  });
}

export function useCities() {
  return useQuery({
    queryKey: riderQueryKeys.cities(),
    queryFn: async () => (await apiClient.get<City[]>("/cities")).data,
    staleTime: 1000 * 60 * 60,
  });
}
