import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/errors';
import { fetchForCustomerPage } from '@/lib/customer/server';
import type { PublicVendorDetail, VendorCatalog } from '@/lib/customer/types';
import { VendorCatalog as VendorCatalogView } from '@/components/customer/vendor/vendor-catalog';

export const metadata = { title: 'Vendor Details' };

async function loadVendor(id: string, locale: string) {
  try {
    const [vendor, catalog] = await Promise.all([
      fetchForCustomerPage<PublicVendorDetail>(`/vendors/${id}`, { locale, returnTo: `/${locale}/vendor/${id}` }),
      fetchForCustomerPage<VendorCatalog>(`/vendors/${id}/catalog`, { locale, returnTo: `/${locale}/vendor/${id}` }),
    ]);
    return { vendor: vendor.data, catalog: catalog.data };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const { vendor, catalog } = await loadVendor(id, locale);
  return <VendorCatalogView vendor={vendor} catalog={catalog} />;
}
