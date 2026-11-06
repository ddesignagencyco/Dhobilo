"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vendorApiClient as apiClient } from "@/lib/api/client";

export type VendorOrderStatus =
  | "PLACED"
  | "ACCEPTED"
  | "REJECTED"
  | "PICKED_UP"
  | "IN_PROCESS"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export type VendorOrderCounts = Record<VendorOrderStatus, number>;

export interface VendorOrderSummary {
  id: string;
  orderNo: string;
  status: VendorOrderStatus;
  placedAt: string;
  vendorRespondBy: string | null;
  respondBy: string | null;
  pickupSlotStart: string;
  pickupSlotEnd: string;
  deliverySlotStart: string;
  deliverySlotEnd: string;
  total: string;
  vendorEarning: string;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string | null;
  itemCount: number;
}

export interface VendorOrderDetail {
  id: string;
  orderNo: string;
  status: VendorOrderStatus;
  currency: string;
  placedAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  vendorRespondBy: string | null;
  rejectionReason: string | null;
  cancelReason: string | null;
  customerNote: string | null;
  addressSnapshot: {
    label?: string | null;
    line1: string;
    line2?: string | null;
    area?: string | null;
  };
  pickupSlotStart: string;
  pickupSlotEnd: string;
  deliverySlotStart: string;
  deliverySlotEnd: string;
  subtotal: string;
  discountTotal: string;
  deliveryFee: string;
  total: string;
  commissionAmount: string;
  vendorEarning: string;
  paymentMethod: string;
  paymentStatus: string;
  customer: { name: string | null; phone: string | null };
  items: {
    id: string;
    name: string;
    nameUr: string | null;
    serviceType: string;
    unitPrice: string;
    qty: number;
    lineTotal: string;
  }[];
  nextActions: VendorOrderStatus[];
  timeline: {
    status: VendorOrderStatus;
    from: VendorOrderStatus | null;
    at: string;
    by: string;
    note: string | null;
  }[];
}

export const BOARD_COLUMNS = {
  new: ["PLACED"],
  inProcess: ["ACCEPTED", "PICKED_UP", "IN_PROCESS"],
  ready: ["READY", "OUT_FOR_DELIVERY"],
} as const satisfies Record<string, readonly VendorOrderStatus[]>;

const ALL_BOARD = [
  ...BOARD_COLUMNS.new,
  ...BOARD_COLUMNS.inProcess,
  ...BOARD_COLUMNS.ready,
];

export const vendorOrderKeys = {
  all: ["vendor", "orders"] as const,
  board: () => [...vendorOrderKeys.all, "board"] as const,
  counts: () => [...vendorOrderKeys.all, "counts"] as const,
  detail: (id: string) => [...vendorOrderKeys.all, "detail", id] as const,
};

const POLL_MS = 15_000;

export function useVendorBoard() {
  return useQuery({
    queryKey: vendorOrderKeys.board(),
    queryFn: async () => {
      const result = await apiClient.get<VendorOrderSummary[]>(
        "/vendor/orders",
        {
          params: { status: ALL_BOARD.join(","), limit: 50 },
        },
      );
      return result.data;
    },
    refetchInterval: POLL_MS,
  });
}

export function useVendorOrderCounts() {
  return useQuery({
    queryKey: vendorOrderKeys.counts(),
    queryFn: async () =>
      (await apiClient.get<VendorOrderCounts>("/vendor/orders/counts")).data,
    refetchInterval: POLL_MS,
  });
}

export function useVendorOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: vendorOrderKeys.detail(orderId ?? ""),
    queryFn: async () =>
      (await apiClient.get<VendorOrderDetail>(`/vendor/orders/${orderId}`))
        .data,
    enabled: !!orderId,
    refetchInterval: POLL_MS,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: vendorOrderKeys.all });
}

export function useAcceptOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (orderId: string) =>
      (
        await apiClient.post<VendorOrderDetail>(
          `/vendor/orders/${orderId}/accept`,
          {},
        )
      ).data,
    onSuccess: invalidate,
  });
}

export function useRejectOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      orderId,
      reason,
    }: {
      orderId: string;
      reason: string;
    }) =>
      (
        await apiClient.post<VendorOrderDetail>(
          `/vendor/orders/${orderId}/reject`,
          { reason },
        )
      ).data,
    onSuccess: invalidate,
  });
}

export function useAdvanceOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      orderId,
      status,
    }: {
      orderId: string;
      status: VendorOrderStatus;
    }) =>
      (
        await apiClient.post<VendorOrderDetail>(
          `/vendor/orders/${orderId}/status`,
          { status },
        )
      ).data,
    onSuccess: invalidate,
  });
}
