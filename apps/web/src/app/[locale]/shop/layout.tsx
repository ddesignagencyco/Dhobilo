import { redirect } from 'next/navigation';
import { VendorShell } from '@/components/vendor/vendor-shell';
import { currentVendor } from '@/lib/api/server';

export default async function VendorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const vendor = await currentVendor();
  if (!vendor) redirect(`/${locale}/login`);

  return (
    <VendorShell
      vendorName={vendor.businessName || vendor.name || vendor.phone || ''}
      vendorStatus={vendor.vendorStatus}
      rejectionReason={vendor.rejectionReason}
      isOwner={vendor.role === 'VENDOR_OWNER'}
    >
      {children}
    </VendorShell>
  );
}
