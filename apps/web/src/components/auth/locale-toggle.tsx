'use client';

import { useTransition } from 'react';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALE_LABELS, routing } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function LocaleToggle({ className }: { className?: string }) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label={t('language')} className={cn('inline-flex items-center gap-1', className)}>
      <Languages className="text-muted-foreground me-1 size-4" aria-hidden />
      {routing.locales.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            disabled={pending}
            onClick={() => {
              if (!active) startTransition(() => router.replace(pathname, { locale: l }));
            }}
            className={cn(
              'inline-flex min-h-9 min-w-11 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors',
              active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {LOCALE_LABELS[l]}
          </button>
        );
      })}
    </div>
  );
}
