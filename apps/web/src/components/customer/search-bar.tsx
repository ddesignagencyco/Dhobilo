'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Submits to /discovery?q=…; on the discovery page it keeps the other filters in the URL. */
export function SearchBar({
  initial = '',
  extraQuery,
  className,
  onDark = false,
}: {
  initial?: string;
  extraQuery?: Record<string, string | undefined>;
  className?: string;
  onDark?: boolean;
}) {
  const t = useTranslations('customer.home');
  const router = useRouter();
  const [value, setValue] = useState(initial);

  return (
    <form
      role="search"
      className={cn(
        'focus-within:ring-ring/40 flex items-center gap-2 rounded-2xl border px-3 shadow-sm transition-shadow focus-within:ring-4',
        onDark ? 'border-white/0 bg-white text-slate-900 focus-within:ring-white/40' : 'bg-card text-foreground',
        className,
      )}
      onSubmit={(event) => {
        event.preventDefault();
        const query: Record<string, string> = {};
        for (const [key, v] of Object.entries(extraQuery ?? {})) if (v) query[key] = v;
        const q = value.trim();
        if (q) query.q = q;
        router.push({ pathname: '/discovery', query });
      }}
    >
      <Search className={cn('size-4 shrink-0', onDark ? 'text-slate-500' : 'text-muted-foreground')} aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        className={cn(
          'h-12 min-w-0 flex-1 bg-transparent text-sm outline-none',
          onDark ? 'placeholder:text-slate-500' : 'placeholder:text-muted-foreground',
        )}
        enterKeyHint="search"
      />
    </form>
  );
}
