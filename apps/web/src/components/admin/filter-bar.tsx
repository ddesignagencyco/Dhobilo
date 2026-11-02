'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCities } from '@/lib/hooks/use-cities';
import { humanise } from '@/lib/format';

/** Sentinel for "no filter". Radix Select cannot hold an empty-string value. */
export const ANY = '__any__';

export function FilterBar({ children, onClear, hasFilters }: { children: ReactNode; onClear?: () => void; hasFilters?: boolean }) {
  const t = useTranslations('common');
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {children}
      {hasFilters && onClear ? (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X />
          {t('clearFilters')}
        </Button>
      ) : null}
    </div>
  );
}

/** Debounced search box: one request when the admin stops typing, not one per keystroke on 3G. */
export function SearchFilter({
  value,
  onChange,
  placeholder,
  delay = 350,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  delay?: number;
}) {
  const t = useTranslations('common');
  const [local, setLocal] = useState(value);

  // Keep in step when the parent clears all filters.
  useEffect(() => setLocal(value), [value]);

  useEffect(() => {
    if (local === value) return;
    const id = setTimeout(() => onChange(local), delay);
    return () => clearTimeout(id);
  }, [local, value, delay, onChange]);

  return (
    <div className="relative w-full sm:w-64">
      <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder ?? t('search')}
        className="ps-8"
        aria-label={placeholder ?? t('search')}
      />
    </div>
  );
}

export function EnumFilter({
  value,
  onChange,
  options,
  anyLabel,
  ariaLabel,
  width = 'w-40',
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  anyLabel: string;
  ariaLabel: string;
  width?: string;
}) {
  return (
    <Select value={value || ANY} onValueChange={(v) => onChange(v === ANY ? '' : v)}>
      <SelectTrigger className={width} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{anyLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {humanise(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CityFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('common');
  const { data: cities, isLoading } = useCities();

  return (
    <Select value={value || ANY} onValueChange={(v) => onChange(v === ANY ? '' : v)} disabled={isLoading}>
      <SelectTrigger className="w-40" aria-label={t('city')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{t('allCities')}</SelectItem>
        {(cities ?? []).map((city) => (
          <SelectItem key={city.id} value={String(city.id)}>
            {city.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
