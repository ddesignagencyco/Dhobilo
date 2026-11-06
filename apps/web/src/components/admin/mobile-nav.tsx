'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AdminRole } from '@dhoblio/shared';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SidebarNav } from './sidebar';
import type { NavBadgeCounts } from '@/lib/admin/nav';

/** The sidebar as a slide-over, for phones. Admins do triage from a phone more often than they admit. */
export function MobileNav({ adminRole, counts }: { adminRole: AdminRole | null; counts?: NavBadgeCounts }) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('openMenu')}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="start" className="w-72 overflow-y-auto p-0">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-sm font-semibold">
              D
            </span>
            Dhoblio
          </SheetTitle>
        </SheetHeader>
        <SidebarNav adminRole={adminRole} counts={counts} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
