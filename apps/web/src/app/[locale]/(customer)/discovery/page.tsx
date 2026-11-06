import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DiscoveryFilters, FilterSidebar } from '@/components/customer/discovery/discovery-filters';
import { DiscoveryView } from '@/components/customer/discovery/discovery-view';
import { LocationChip } from '@/components/customer/location-chip';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'Discover Vendors' };

export default async function DiscoveryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  const search = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('customer.discovery');

  const sortBy = search.sort === 'rating' || search.sort === 'price' ? search.sort : 'distance';
  const filters = {
    q: search.q?.trim() || undefined,
    sortBy: sortBy as 'distance' | 'rating' | 'price',
    minRating: search.minRating ? Number(search.minRating) : undefined,
    serviceType: search.serviceType,
  };

  const query = { q: search.q, serviceType: search.serviceType, sort: search.sort, minRating: search.minRating };

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <aside className="sticky top-20 hidden lg:block">
          <FilterSidebar query={query} />
        </aside>
        <div className="min-w-0 space-y-5">
          <div className="xl:hidden">
            <LocationChip />
          </div>
          <DiscoveryFilters query={query} />
          <DiscoveryView key={JSON.stringify(filters)} filters={filters} />
        </div>
      </div>
    </div>
  );
}
