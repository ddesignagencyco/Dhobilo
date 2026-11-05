"use client";

import { useQuery } from "@tanstack/react-query";
import { vendorApiClient as apiClient } from "@/lib/api/client";

export type EarningsRange = "day" | "week" | "month";

export interface VendorEarnings {
  range: EarningsRange;
  from: string;
  to: string;
  totals: { orders: number; gross: string; commission: string; net: string };
  balance: {
    total: string;
    pending: string;
    available: string;
    awaitingCash: { orders: number; amount: string };
  };
  orders: {
    id: string;
    orderNo: string;
    deliveredAt: string;
    subtotal: string;
    discount: string;
    commissionRatePct: string;
    commission: string;
    net: string;
  }[];
}

export type LedgerType =
  "ORDER_EARNING" | "COMMISSION" | "PAYOUT" | "ADJUSTMENT" | "REFUND";

export interface LedgerEntry {
  id: string;
  orderId: string | null;
  payoutId: string | null;
  type: LedgerType;
  amount: string;
  note: string | null;
  createdAt: string;
}

export function useVendorEarnings(range: EarningsRange = "week") {
  return useQuery({
    queryKey: ["vendor", "earnings", range],
    queryFn: async () =>
      (
        await apiClient.get<VendorEarnings>("/vendor/earnings", {
          params: { range },
        })
      ).data,
  });
}

export function useVendorLedger() {
  return useQuery({
    queryKey: ["vendor", "ledger"],
    queryFn: async () =>
      (await apiClient.get<LedgerEntry[]>("/vendor/ledger")).data,
  });
}
