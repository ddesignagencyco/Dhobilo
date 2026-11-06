'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { CartButton } from '@/components/customer/cart/cart-button';
import { CustomerUserMenu } from '@/components/customer/customer-user-menu';
import { LocationChip } from '@/components/customer/location-chip';
import { CUSTOMER_NAV, isNavActive } from '@/components/customer/nav-items';
import { SearchBar } from '@/components/customer/search-bar';
import { cn } from '@/lib/utils';

/**
 * Top bar that condenses (shorter, with a hairline shadow) as soon as the page scrolls. On phones it is just logo,
 * cart and avatar (the bottom nav carries navigation); from md it also holds the primary nav, from lg the search,
 * and from xl the delivery address.
 */
export function CustomerHeader({ initial, name }: { initial: string; name: string }) {
  const t = useTranslations('customer');
  const pathname = usePathname();
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setCondensed(window.scrollY > 8));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      className={cn(
        'bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-30 border-b backdrop-blur-md',
        'transition-[box-shadow,border-color] duration-300',
        condensed ? 'border-border shadow-sm' : 'border-transparent',
      )}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 transition-[height] duration-300 ease-out sm:px-6 lg:gap-5 lg:px-10',
          condensed ? 'h-12 md:h-14' : 'h-16',
        )}
      >
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <span
            className={cn(
              'bg-primary text-primary-foreground flex items-center justify-center font-semibold shadow-sm transition-all duration-300',
              'group-active:scale-95',
              condensed ? 'size-7 rounded-lg text-sm' : 'size-9 rounded-xl text-base',
            )}
          >
            D
          </span>
          <span
            className={cn(
              'font-semibold tracking-tight transition-all duration-300',
              condensed ? 'text-base' : 'text-lg',
            )}
          >
            {t('brand')}
          </span>
        </Link>

        <nav aria-label={t('nav.label')} className="ms-2 hidden items-center gap-1 md:flex">
          {CUSTOMER_NAV.map(({ href, label, icon: Icon }) => {
            const active = isNavActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-200',
                  active ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {t(`nav.${label}`)}
              </Link>
            );
          })}
        </nav>

        <div className="mx-auto hidden w-full max-w-md min-w-0 flex-1 lg:block">
          <SearchBar size="sm" />
        </div>

        <div className="ms-auto flex items-center gap-2 lg:ms-0">
          <LocationChip className="hidden xl:inline-flex" />
          <CartButton />
          <Link
            href="/profile"
            className="bg-accent text-accent-foreground hover:ring-primary/30 flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-shadow hover:ring-4 active:scale-95 md:hidden"
            aria-label={t('nav.profile')}
          >
            {initial}
          </Link>
          <div className="hidden md:block">
            <CustomerUserMenu initial={initial} name={name} />
          </div>
        </div>
      </div>
    </header>
  );
}
