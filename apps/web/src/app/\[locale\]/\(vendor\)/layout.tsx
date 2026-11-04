import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { VendorShell } from '@/components/vendor/vendor-shell';
import { currentVendor } from '@/lib/api/server';

/**
 * Vendor app shell: wraps all (vendor) routes.
 * Ensures vendor is authenticated and loads vendor profile.
 */
export default async function VendorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Fetch current vendor from /me endpoint
  const vendor = await currentVendor();
  if (!vendor) {
    redirect(`/${locale}/login`);
  }

  // Only allow VENDOR role
  if (vendor.role !== 'VENDOR') {
    redirect(`/${locale}/login`);
  }

  return (
    <VendorShell vendorName={vendor.name} vendorStatus={vendor.vendorStatus || 'PENDING'}>
      {children}
    </VendorShell>
  );
}
