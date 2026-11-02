'use client';

import { useQuery } from '@tanstack/react-query';
import { bffData } from '@/lib/api/bff';
import type { City } from '@/lib/api/types';

/**
 * Cities, for every city filter in the panel. They change about once a quarter, so this is cached for an
 * hour rather than refetched with each screen.
 */
export function useCities() {
  return useQuery({
    queryKey: ['cities'],
    queryFn: () => bffData<City[]>('/cities'),
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
  });
}

/** id -> name, for rendering a cityId that a list returns without its city object. */
export function useCityNames(): Record<number, string> {
  const { data } = useCities();
  const map: Record<number, string> = {};
  for (const city of data ?? []) map[city.id] = city.name;
  return map;
}
