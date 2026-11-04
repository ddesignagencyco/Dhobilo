import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { VendorShell } from '@/components/vendor/vendor-shell';
import { currentVendor } from '@/lib/api/server';

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const vendor = await currentVendor();
  if (!vendor) {
    redirect(`/login`);
  }

  if (vendor.role !== 'VENDOR_OWNER' && vendor.role !== 'VENDOR_STAFF') {
    redirect(`/login`);
  }

  return (
    <VendorShell vendorName={vendor.name} vendorStatus={vendor.vendorStatus || 'PENDING'}>
      {children}
    </VendorShell>
  );
}
