'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { VendorUserMenu } from './vendor-user-menu';
import { VendorMobileNav } from './vendor-mobile-nav';
import { type BlockedStatus, VendorStatusScreen } from './vendor-status-screen';
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
  rejectionReason,
  isOwner,
}: {
  children: React.ReactNode;
  vendorName: string;
  vendorStatus: 'UNREGISTERED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  rejectionReason: string | null;
  isOwner: boolean;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const restricted = vendorStatus !== 'APPROVED';
  const onRegister = pathname === '/shop/register' || pathname.startsWith('/shop/register/');
  const canRegisterNow = vendorStatus === 'UNREGISTERED' || vendorStatus === 'REJECTED';
  const showStatus = restricted && !(onRegister && canRegisterNow);

  return (
    <div className="bg-muted/30 min-h-dvh">
      {!restricted ? (
        <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 start-0 z-30 hidden w-64 overflow-y-auto border-e lg:block">
          <div className="border-sidebar-border flex h-14 items-center gap-2 border-b px-5">
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-sm font-semibold">
              D
            </span>
            <Link href="/shop/orders" className="font-semibold tracking-tight">
              {t('common.appName')}
            </Link>
            <span className="text-muted-foreground ms-auto text-xs">{t('vendor.panel')}</span>
          </div>
          <VendorSidebarNav isOwner={isOwner} />
        </aside>
      ) : null}

      <div className={restricted ? '' : 'lg:ps-64'}>
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
          <VendorMobileNav restricted={restricted} isOwner={isOwner} />

          <span className="truncate font-semibold" data-testid="vendor-name">
            {vendorName}
          </span>

          {vendorStatus === 'APPROVED' && (
            <div className="ms-auto hidden sm:block">
              <AvailabilityToggle />
            </div>
          )}

          <div className={vendorStatus === 'APPROVED' ? 'flex items-center gap-2' : 'ms-auto flex items-center gap-2'}>
            <VendorUserMenu name={vendorName} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
          {showStatus ? (
            <VendorStatusScreen status={vendorStatus as BlockedStatus} reason={rejectionReason} isOwner={isOwner} />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
