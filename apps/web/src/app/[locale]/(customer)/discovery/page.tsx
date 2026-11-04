import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { VendorList } from '@/components/customer/discovery/vendor-list';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata = { title: 'Discover Vendors' };

export default async function DiscoveryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { locale } = await params;
  const search = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('customer.discovery');

  // Parse filters from URL
  const filters = {
    sortBy: (search.sort as 'distance' | 'rating' | 'price' | undefined) ?? 'distance',
    minRating: search.minRating ? Number(search.minRating) : undefined,
    maxPrice: search.maxPrice ? Number(search.maxPrice) : undefined,
    serviceType: search.serviceType,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {/* Filters row (placeholder for future) */}
      <div className="flex gap-2">
        {/* TODO: Add filter/sort buttons here in Task 3 extension */}
      </div>

      {/* Vendor list with suspense fallback */}
      <Suspense fallback={<Skeleton className="h-96" />}>
        <VendorList filters={filters} />
      </Suspense>
    </div>
  );
}
