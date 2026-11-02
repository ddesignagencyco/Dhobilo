'use client';

import { useTransition } from 'react';
import { Check, Globe, LogOut, UserCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALE_LABELS, routing } from '@/i18n/routing';
import type { AdminRole } from '@dhoblio/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/lib/auth/actions';

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu({
  name,
  email,
  adminRole,
}: {
  name: string | null;
  email: string | null;
  adminRole: AdminRole | null;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label={t('nav.account')}>
          <Avatar>
            <AvatarFallback>{initials(name, email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{name || email}</span>
            {email && name ? <span className="text-muted-foreground truncate text-xs">{email}</span> : null}
            {adminRole ? (
              <span className="text-muted-foreground mt-1 text-xs">{t(`roles.${adminRole}`)}</span>
            ) : null}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-muted-foreground flex items-center gap-2 text-xs font-normal">
          <Globe className="size-3.5" />
          {t('common.language')}
        </DropdownMenuLabel>

        {routing.locales.map((l) => (
          <DropdownMenuItem
            key={l}
            onSelect={() => {
              // Replace, not push: switching language should not add a history entry to go back through.
              startTransition(() => router.replace(pathname, { locale: l }));
            }}
            className="justify-between"
          >
            <span lang={l}>{LOCALE_LABELS[l]}</span>
            {l === locale ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <a href={`/${locale}/admin/account`} className="flex items-center gap-2">
            <UserCircle />
            {t('nav.account')}
          </a>
        </DropdownMenuItem>

        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            startTransition(() => void signOut(locale));
          }}
        >
          <LogOut />
          {t('common.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
