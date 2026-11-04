'use client';

import { Home, ReceiptText, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: 'home', icon: Home },
  { href: '/orders', label: 'orders', icon: ReceiptText },
  { href: '/profile', label: 'profile', icon: UserRound },
] as const;

export function BottomNav() {
  const t = useTranslations('customer.nav');
  const pathname = usePathname();

  return (
    <nav
      aria-label={t('label')}
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-3xl items-stretch">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span>{t(label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
