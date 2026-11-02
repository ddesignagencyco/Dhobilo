import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/admin/page-header';
import { StatusBadge } from '@/components/admin/status-badge';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/errors';
import { fetchForPage } from '@/lib/api/server';
import type { AdminVendorDetail, City } from '@/lib/api/types';
import { VendorActions } from './vendor-actions';
import { VendorDetailCards } from './vendor-detail-cards';

export const metadata: Metadata = { title: 'Vendor' };

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  let vendor: AdminVendorDetail;
  try {
    const result = await fetchForPage<AdminVendorDetail>(`/admin/vendors/${id}`, {
      locale,
      returnTo: `/${locale}/admin/vendors/${id}`,
      cache: 'no-store',
    });
    vendor = result.data;
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  }

  // Cities are a small public list; fetched here so the server render already shows the city name.
  let cityName = `#${vendor.cityId}`;
  try {
    const { data: cities } = await fetchForPage<City[]>('/cities', { locale, revalidate: 3600 });
    cityName = cities.find((c) => c.id === vendor.cityId)?.name ?? cityName;
  } catch {
    // A missing city label must not take down the whole vendor page.
  }

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ms-2">
        <Link href="/admin/vendors">
          <ArrowLeft className="rtl:rotate-180" />
          {t('vendors.backToList')}
        </Link>
      </Button>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {vendor.businessName}
            <StatusBadge status={vendor.status} />
          </span>
        }
        description={`${cityName} · ${vendor.addressLine ?? '—'}`}
        actions={<VendorActions vendorId={vendor.id} status={vendor.status} />}
      />

      <VendorDetailCards vendor={vendor} cityName={cityName} />
    </>
  );
}
