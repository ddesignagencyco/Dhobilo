'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useDiscovery, type DiscoveryFilters } from '@/lib/customer/hooks/use-discovery';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VendorCard } from './vendor-card';

interface VendorListProps {
  lat: number;
  lng: number;
  filters?: DiscoveryFilters;
}

export function VendorList({ lat, lng, filters = {} }: VendorListProps) {
  const t = useTranslations('customer.discovery');
  const { data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage } = useDiscovery(lat, lng, filters);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { threshold: 0.1 },
    );

    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const vendors = data?.pages.flatMap((page) => page.items) ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-40" />
        ))}
      </div>
    );
  }

  if (vendors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-muted-foreground">{t('empty')}</p>
        <p className="text-muted-foreground text-sm">{t('emptyHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {vendors.map((vendor) => (
          <VendorCard key={vendor.id} vendor={vendor} />
        ))}
      </div>

      <div ref={loadMoreRef} className="flex justify-center pt-8">
        {hasNextPage ? (
          <Button onClick={() => void fetchNextPage()} disabled={isFetchingNextPage} variant="outline">
            {isFetchingNextPage ? t('loading') : t('loadMore')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
