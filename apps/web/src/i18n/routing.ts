import { defineRouting } from 'next-intl/routing';

/**
 * Locale routing for all four role UIs (FE-0.2). `ur` renders RTL.
 *
 * `localePrefix: 'always'` keeps every URL unambiguous — /en/admin/orders and /ur/admin/orders — which
 * matters for the deep links support staff paste to each other.
 */
export const routing = defineRouting({
  locales: ['en', 'ur'],
  defaultLocale: 'en',
  localePrefix: 'always',
  localeDetection: true,
});

export type AppLocale = (typeof routing.locales)[number];

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: 'English',
  ur: 'اردو',
};

export function isRtl(locale: string): boolean {
  return locale === 'ur';
}

export function textDirection(locale: string): 'ltr' | 'rtl' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}
