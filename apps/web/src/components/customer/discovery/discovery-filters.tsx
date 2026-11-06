'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { SearchBar } from '@/components/customer/search-bar';
import { ServiceChips } from '@/components/customer/service-chips';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface DiscoveryQuery {
  q?: string;
  serviceType?: string;
  sort?: string;
  minRating?: string;
}

const SORTS = ['distance', 'rating', 'price'] as const;
const RATINGS = ['3', '4', '4.5'] as const;

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-95',
        selected ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-card hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

/** Search, service chips and a bottom sheet for sort and rating. State lives in the URL so it is shareable. */
export function DiscoveryFilters({ query }: { query: DiscoveryQuery }) {
  const t = useTranslations('customer.discovery');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState(query.sort ?? 'distance');
  const [minRating, setMinRating] = useState(query.minRating ?? '');

  const push = (next: DiscoveryQuery) => {
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(next)) if (value) clean[key] = value;
    router.replace({ pathname: '/discovery', query: clean });
  };

  const activeCount = (query.sort && query.sort !== 'distance' ? 1 : 0) + (query.minRating ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <SearchBar
          className="flex-1"
          initial={query.q}
          extraQuery={{ serviceType: query.serviceType, sort: query.sort, minRating: query.minRating }}
        />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="relative size-12 shrink-0 rounded-2xl"
              aria-label={t('filters')}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              {activeCount > 0 ? (
                <span className="bg-primary text-primary-foreground dh-tick tabular absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
                  {activeCount}
                </span>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl pb-4">
            <SheetHeader>
              <SheetTitle>{t('filters')}</SheetTitle>
              <SheetDescription>{t('filtersHint')}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('sortBy')}</p>
                <div className="flex flex-wrap gap-2">
                  {SORTS.map((value) => (
                    <Choice key={value} selected={sort === value} onClick={() => setSort(value)}>
                      {t(`sort.${value}`)}
                    </Choice>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('minRating')}</p>
                <div className="flex flex-wrap gap-2">
                  <Choice selected={minRating === ''} onClick={() => setMinRating('')}>
                    {t('anyRating')}
                  </Choice>
                  {RATINGS.map((value) => (
                    <Choice key={value} selected={minRating === value} onClick={() => setMinRating(value)}>
                      <span className="tabular">{value}+</span>
                    </Choice>
                  ))}
                </div>
              </div>
            </div>
            <SheetFooter className="flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSort('distance');
                  setMinRating('');
                  push({ q: query.q, serviceType: query.serviceType });
                  setOpen(false);
                }}
              >
                {t('reset')}
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  push({ ...query, sort: sort === 'distance' ? undefined : sort, minRating: minRating || undefined });
                  setOpen(false);
                }}
              >
                {t('apply')}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      <ServiceChips active={query.serviceType} onSelect={(value) => push({ ...query, serviceType: value })} />
    </div>
  );
}
