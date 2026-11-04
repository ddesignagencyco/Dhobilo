'use client';

import { useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ActiveCity } from '@/lib/customer/types';

const CITY_COOKIE = 'dh_city';
const CITY_EVENT = 'dhoblio:city';
const ONE_YEAR = 60 * 60 * 24 * 365;

function readCityCookie(): string {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${CITY_COOKIE}=`));
  return match?.split('=')[1] ?? '';
}

function subscribe(onChange: () => void) {
  window.addEventListener(CITY_EVENT, onChange);
  return () => window.removeEventListener(CITY_EVENT, onChange);
}

function writeCityCookie(value: string) {
  document.cookie = `${CITY_COOKIE}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  window.dispatchEvent(new Event(CITY_EVENT));
}

/**
 * City is a preference for discovery, not part of the account yet (the API's /me has name and locale).
 * Storing it in a cookie keeps it server-readable for the discovery page without inventing a column.
 * The cookie is read through useSyncExternalStore so the server render and the hydrated client agree.
 */
export function CityPicker({ cities }: { cities: ActiveCity[] }) {
  const t = useTranslations('customer.home');
  const locale = useLocale();
  const stored = useSyncExternalStore(subscribe, readCityCookie, () => '');

  const known = stored === 'none' || cities.some((city) => String(city.id) === stored);
  const value = known ? stored : '';

  if (cities.length === 0) {
    return (
      <Alert variant="warning">
        <AlertDescription>{t('noCity')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      <Select value={value || undefined} onValueChange={writeCityCookie}>
        <SelectTrigger className="w-full" aria-label={t('chooseCity')}>
          <SelectValue placeholder={t('chooseCity')} />
        </SelectTrigger>
        <SelectContent>
          {cities.map((city) => (
            <SelectItem key={city.id} value={String(city.id)}>
              {locale === 'ur' ? city.nameUr : city.name}
            </SelectItem>
          ))}
          <SelectItem value="none">{t('cityNotListed')}</SelectItem>
        </SelectContent>
      </Select>

      {value === 'none' ? (
        <Alert variant="warning">
          <AlertDescription>
            {t('noCity')} {t('noCityHint')}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
