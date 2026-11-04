'use client';

import { useRef, useEffect } from 'react';
import { useDiscovery } from '@/lib/customer/hooks/use-discovery';
import { VendorCard } from './vendor-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { DiscoveryFilters } from '@/lib/customer/hooks/use-discovery';

interface VendorListProps {
  filters?: DiscoveryFilters;
}

export function VendorList({ filters = {} }: VendorListProps) {
  const { data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage } = useDiscovery(filters);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll: load more when load-more button enters viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const vendors = data?.pages.flatMap((page) => page.vendors) ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  if (vendors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-muted-foreground">No vendors found</p>
        <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {vendors.map((vendor) => (
          <VendorCard key={vendor.id} {...vendor} />
        ))}
      </div>

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="flex justify-center pt-8">
        {hasNextPage && (
          <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} variant="outline">
            {isFetchingNextPage ? 'Loading...' : 'Load More'}
          </Button>
        )}
      </div>
    </div>
  );
}
