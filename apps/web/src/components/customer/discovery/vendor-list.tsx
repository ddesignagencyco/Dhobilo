'use client';

import { useEffect, useRef } from 'react';
import { Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useDiscovery, type DiscoveryFilters } from '@/lib/customer/hooks/use-discovery';
import { VendorCard } from './vendor-card';

interface VendorListProps {
  lat: number;
  lng: number;
  filters?: DiscoveryFilters;
  limit?: number;
}

function CardSkeleton() {
  return (
    <div className="bg-card space-y-3 rounded-2xl border p-4">
      <div className="flex gap-3">
        <Skeleton className="size-14 rounded-2xl" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-7 w-1/3" />
    </div>
  );
}

export function VendorList({ lat, lng, filters = {}, limit }: VendorListProps) {
  const t = useTranslations('customer.discovery');
  const { data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage } = useDiscovery(lat, lng, filters);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const paged = limit === undefined;

  useEffect(() => {
    if (!paged) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { threshold: 0.1, rootMargin: '200px' },
    );

    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [paged, fetchNextPage, hasNextPage, isFetchingNextPage]);

  const all = data?.pages.flatMap((page) => page.items) ?? [];
  const vendors = limit ? all.slice(0, limit) : all;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: limit ?? 6 }).map((_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (vendors.length === 0) {
    return <EmptyState icon={<Store aria-hidden />} title={t('empty')} description={t('emptyHint')} />;
  }

  return (
    <div className="space-y-4">
      <div className="stagger grid grid-cols-1 gap-3 md:grid-cols-2">
        {vendors.map((vendor) => (
          <VendorCard key={vendor.id} vendor={vendor} />
        ))}
      </div>

      {paged ? (
        <>
          <div ref={loadMoreRef} className="h-1" aria-hidden />
          {isFetchingNextPage ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <CardSkeleton />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
