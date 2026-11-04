import { redirect } from 'next/navigation';
import { VendorShell } from '@/components/vendor/vendor-shell';
import { currentVendor } from '@/lib/api/server';

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const vendor = await currentVendor();
  if (!vendor) {
    redirect(`/login`);
  }

  return (
    <VendorShell vendorName={vendor.name || 'Shop'} vendorStatus={vendor.vendorStatus || 'PENDING'}>
      {children}
    </VendorShell>
  );
}
