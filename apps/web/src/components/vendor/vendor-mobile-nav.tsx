'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { VendorSidebarNav } from './sidebar-nav';

export function VendorMobileNav({ restricted, isOwner }: { restricted: boolean; isOwner: boolean }) {
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
          <SheetTitle className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-sm font-semibold">
              D
            </span>
            {t('common.appName')}
          </SheetTitle>
        </SheetHeader>
        <VendorSidebarNav isOwner={isOwner} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
