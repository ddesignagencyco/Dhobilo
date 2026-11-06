'use client';

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** One-tap EN / اردو switch. Shows the language you would switch TO, in that language's own script. */
export function LocaleSwitch({ className }: { className?: string }) {
  const t = useTranslations('rider.shell');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const next = locale === 'ur' ? 'en' : 'ur';

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: next })}
      aria-label={t('switchLanguage')}
      className={cn(
        'bg-muted text-foreground hover:bg-accent inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors active:scale-95',
        className,
      )}
    >
      <Languages className="size-4" aria-hidden />
      <span lang={next}>{next === 'ur' ? 'اردو' : 'EN'}</span>
    </button>
  );
}
