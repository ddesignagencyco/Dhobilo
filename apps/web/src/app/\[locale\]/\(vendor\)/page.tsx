import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

/**
 * Vendor home: redirect to the orders board (primary task for vendors).
 */
export default async function VendorHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  redirect(`/${locale}/vendor/orders`);
}
