"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vendorApiClient as apiClient } from "@/lib/api/client";

export type PayoutStatus = "REQUESTED" | "APPROVED" | "PAID" | "REJECTED";

export interface Payout {
  id: string;
  amount: string;
  method: "BANK" | "WALLET";
  accountRef: string;
  status: PayoutStatus;
  requestedAt: string;
  processedAt: string | null;
  txnRef: string | null;
  note: string | null;
}

export interface RequestPayoutInput {
  amount: string;
  method: "BANK" | "WALLET";
  accountRef: string;
  note?: string;
}

export function useVendorPayouts() {
  return useQuery({
    queryKey: ["vendor", "payouts"],
    queryFn: async () =>
      (await apiClient.get<Payout[]>("/vendor/payouts")).data,
  });
}

export function useRequestPayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RequestPayoutInput) =>
      (await apiClient.post<Payout>("/vendor/payouts", input)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vendor", "payouts"] });
      void queryClient.invalidateQueries({ queryKey: ["vendor", "earnings"] });
      void queryClient.invalidateQueries({ queryKey: ["vendor", "ledger"] });
    },
  });
}
