'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { UserMenu } from '@/components/admin/user-menu';
import { MobileNav } from '@/components/admin/mobile-nav';
import { VendorSidebarNav } from './sidebar-nav';
import { AvailabilityToggle } from './forms/availability-toggle';

/**
 * Vendor app shell: fixed sidebar on desktop, collapse to burger on mobile.
 * Matches admin layout pattern for consistency.
 */
export function VendorShell({
  children,
  vendorName,
  vendorStatus,
}: {
  children: React.ReactNode;
  vendorName: string;
  vendorStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
}) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <div className="bg-muted/30 min-h-dvh">
      {/* Desktop sidebar: fixed, scrollable */}
      <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 start-0 z-30 hidden w-64 overflow-y-auto border-e lg:block">
        <div className="border-sidebar-border flex h-14 items-center gap-2 border-b px-5">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-sm font-semibold">
            D
          </span>
          <Link href="/vendor" className="font-semibold tracking-tight">
            {t('common.appName')}
          </Link>
          <span className="text-muted-foreground ms-auto text-xs">{t('vendor.panel')}</span>
        </div>
        <VendorSidebarNav onNavigate={undefined} />
      </aside>

      {/* Main content area */}
      <div className="lg:ps-64">
        {/* Header: sticky, with mobile nav, availability toggle, user menu */}
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
          <MobileNav adminRole={null} />

          <Link href="/vendor" className="font-semibold lg:hidden">
            {t('common.appName')}
          </Link>

          {/* Availability toggle (only show if vendor is APPROVED) */}
          {vendorStatus === 'APPROVED' && (
            <div className="hidden sm:block ms-auto">
              <AvailabilityToggle />
            </div>
          )}

          <div className="ms-auto flex items-center gap-2">
            <UserMenu name={vendorName} email="" adminRole={null} />
          </div>
        </header>

        {/* Main content */}
        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
