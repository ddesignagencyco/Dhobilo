'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CartButton } from '@/components/customer/cart/cart-button';
import { cn } from '@/lib/utils';

/** Top bar that condenses (shorter, with a hairline shadow) as soon as the page scrolls. */
export function CustomerHeader({ initial }: { initial: string }) {
  const t = useTranslations('customer');
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
        'bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-20 border-b backdrop-blur-md',
        'transition-[box-shadow,border-color] duration-300',
        condensed ? 'border-border shadow-sm' : 'border-transparent',
      )}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-3xl items-center gap-3 px-4 transition-[height] duration-300 ease-out',
          condensed ? 'h-12' : 'h-16',
        )}
      >
        <Link href="/" className="group flex items-center gap-2.5">
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

        <div className="ms-auto flex items-center gap-2">
          <CartButton />
          <Link
            href="/profile"
            className="bg-accent text-accent-foreground hover:ring-primary/30 flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-shadow hover:ring-4 active:scale-95"
            aria-label={t('nav.profile')}
          >
            {initial}
          </Link>
        </div>
      </div>
    </header>
  );
}
