'use client';

import { useTransition } from 'react';
import { Check, LogOut, ReceiptText, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LOCALE_LABELS, routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { changeCustomerLanguage, signOutCustomer } from '@/lib/customer/actions';
import { cn } from '@/lib/utils';

/** Avatar menu for the desktop header: profile, orders, language and sign out. */
export function CustomerUserMenu({ initial, name }: { initial: string; name: string }) {
  const t = useTranslations('customer');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('nav.account')}
          className="bg-accent text-accent-foreground hover:ring-primary/30 data-[state=open]:ring-primary/30 flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-shadow hover:ring-4 data-[state=open]:ring-4 active:scale-95"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5">
        <DropdownMenuLabel className="truncate text-sm font-semibold">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound aria-hidden />
            {t('nav.profile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/orders">
            <ReceiptText aria-hidden />
            {t('nav.orders')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
          {t('profile.language')}
        </DropdownMenuLabel>
        {routing.locales.map((next) => (
          <DropdownMenuItem
            key={next}
            disabled={pending}
            onSelect={() => {
              if (next !== locale) startTransition(() => void changeCustomerLanguage(locale, next));
            }}
            className={cn(next === locale && 'font-semibold')}
          >
            <span lang={next} className="flex-1">
              {LOCALE_LABELS[next]}
            </span>
            {next === locale ? <Check className="text-primary" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => startTransition(() => void signOutCustomer(locale))}>
          <LogOut aria-hidden />
          {t('profile.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
