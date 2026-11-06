import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DiscoveryView } from '@/components/customer/discovery/discovery-view';
import { PageHeader } from '@/components/ui/page-header';

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
      <PageHeader title={t('title')} description={t('subtitle')} />

      {/* Filters row (placeholder for future) */}
      <div className="flex gap-2">{/* TODO: Add filter/sort buttons here in Task 3 extension */}</div>

      <DiscoveryView filters={filters} />
    </div>
  );
}
