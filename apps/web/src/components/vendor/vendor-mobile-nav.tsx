'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ShopAvatar } from './shop-avatar';
import { VendorSidebarNav } from './sidebar-nav';

export function VendorMobileNav({
  restricted,
  isOwner,
  vendorName,
}: {
  restricted: boolean;
  isOwner: boolean;
  vendorName: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  if (restricted) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t('nav.openMenu')}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="start" className="w-72 overflow-y-auto p-0">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-3">
            <ShopAvatar name={vendorName} />
            <span className="min-w-0">
              <span className="block truncate text-sm leading-tight font-semibold">{vendorName}</span>
              <span className="text-muted-foreground block text-xs font-normal">{t('common.appName')}</span>
            </span>
          </SheetTitle>
        </SheetHeader>
        <VendorSidebarNav isOwner={isOwner} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
