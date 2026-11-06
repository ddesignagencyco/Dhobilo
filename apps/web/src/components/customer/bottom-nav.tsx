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

  const activeIndex = ITEMS.findIndex(({ href }) =>
    href === '/'
      ? pathname === '/' || pathname.startsWith('/discovery') || pathname.startsWith('/vendor')
      : pathname.startsWith(href),
  );

  return (
    <nav
      aria-label={t('label')}
      className="bg-background/90 supports-[backdrop-filter]:bg-background/75 safe-bottom fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md"
    >
      <ul className="relative mx-auto flex w-full max-w-3xl items-stretch">
        {activeIndex >= 0 ? (
          <span
            aria-hidden
            style={{ ['--i' as string]: activeIndex }}
            className="pointer-events-none absolute inset-y-0 start-0 flex w-1/3 justify-center transition-transform duration-500 ease-[var(--ease-spring)] ltr:translate-x-[calc(var(--i)*100%)] rtl:-translate-x-[calc(var(--i)*100%)]"
          >
            <span className="bg-primary h-0.5 w-10 rounded-b-full" />
          </span>
        ) : null}
        {ITEMS.map(({ href, label, icon: Icon }, index) => {
          const active = index === activeIndex;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-200',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-all duration-300',
                    active ? 'bg-primary/12 scale-100' : 'scale-95 group-active:scale-90',
                  )}
                >
                  <Icon className={cn('size-5 transition-transform duration-300', active && 'scale-110')} aria-hidden />
                </span>
                <span>{t(label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
