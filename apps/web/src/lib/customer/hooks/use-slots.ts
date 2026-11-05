'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { SlotResponse } from '../types';

interface SlotOptions {
  turnaroundHours?: number | null;
  pickupEnd?: string | null;
}

export function useSlots(
  vendorId: string | undefined,
  date: string | undefined,
  type: 'pickup' | 'delivery',
  options: SlotOptions = {},
) {
  return useQuery({
    queryKey: ['slots', vendorId, date, type, options.turnaroundHours ?? null, options.pickupEnd ?? null],
    queryFn: async () => {
      const result = await apiClient.get<SlotResponse>(`/vendors/${vendorId}/slots`, {
        params: {
          date,
          type,
          turnaroundHours: type === 'delivery' ? options.turnaroundHours : undefined,
          pickupEnd: type === 'delivery' ? options.pickupEnd : undefined,
        },
      });
      return result.data;
    },
    enabled: !!vendorId && !!date && (type === 'pickup' || !!options.pickupEnd),
    staleTime: 1000 * 30,
  });
}
