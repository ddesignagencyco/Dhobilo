import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { currentCustomer } from '@/lib/customer/server';
import { LocationChip } from '@/components/customer/location-chip';
import { SearchBar } from '@/components/customer/search-bar';
import { ServiceChips } from '@/components/customer/service-chips';
import { DiscoveryView } from '@/components/customer/discovery/discovery-view';

export const metadata: Metadata = { title: 'Home' };

function partOfDay(): 'Morning' | 'Afternoon' | 'Evening' {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Karachi' }).format(new Date()),
  );
  return hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
}

export default async function CustomerHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('customer.home');
  const customer = await currentCustomer();
  const firstName = customer?.name?.trim().split(/\s+/)[0];

  return (
    <div className="space-y-6 lg:space-y-10">
      <section className="relative overflow-hidden rounded-3xl bg-[oklch(0.46_0.095_196)] p-5 text-white shadow-sm md:p-8 lg:p-12 dark:bg-[oklch(0.34_0.065_196)]">
        <svg
          aria-hidden
          className="text-white/10 pointer-events-none absolute -end-10 -top-12 size-56 md:-end-16 md:-top-20 md:size-80 lg:-end-24 lg:-top-32 lg:size-[34rem] rtl:-scale-x-100"
          viewBox="0 0 200 200"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          {[30, 55, 80, 105].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} />
          ))}
        </svg>

        <div className="relative max-w-2xl space-y-4 lg:space-y-6">
          <div className="xl:hidden">
            <LocationChip onDark />
          </div>
          <div>
            <p className="text-sm text-white/80 md:text-base">{t(`greet${partOfDay()}`)}</p>
            <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl lg:text-5xl">
              {firstName ?? t('greetingGuest')}
            </h1>
            <p className="mt-1 text-sm text-white/85 md:text-base lg:mt-2 lg:text-lg">{t('heroTitle')}</p>
          </div>
          <SearchBar onDark />
        </div>

        <div className="absolute end-12 top-1/2 hidden w-[21rem] -translate-y-1/2 rounded-2xl bg-white/10 p-5 backdrop-blur-sm xl:block">
          <p className="mb-4 text-sm font-semibold text-white/90">{t('howTitle')}</p>
          <ol className="space-y-4">
            {(['how1', 'how2', 'how3'] as const).map((key, index) => (
              <li key={key} className="flex items-center gap-3">
                <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-[oklch(0.4_0.09_196)]">
                  {index + 1}
                </span>
                <span className="text-sm text-white/95">{t(key)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold md:text-lg">{t('servicesTitle')}</h2>
        <ServiceChips cards />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold md:text-lg">{t('nearYou')}</h2>
          <Link
            href="/discovery"
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            {t('seeAll')}
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
        <DiscoveryView filters={{}} limit={8} />
      </section>
    </div>
  );
}
