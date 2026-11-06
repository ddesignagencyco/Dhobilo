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
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-[oklch(0.46_0.095_196)] p-5 text-white shadow-sm dark:bg-[oklch(0.34_0.065_196)]">
        <svg
          aria-hidden
          className="text-white/10 pointer-events-none absolute -end-10 -top-12 size-56 rtl:-scale-x-100"
          viewBox="0 0 200 200"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          {[30, 55, 80, 105].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} />
          ))}
        </svg>

        <div className="relative space-y-4">
          <LocationChip onDark />
          <div>
            <p className="text-sm text-white/80">{t(`greet${partOfDay()}`)}</p>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{firstName ?? t('greetingGuest')}</h1>
            <p className="mt-1 text-sm text-white/85">{t('heroTitle')}</p>
          </div>
          <SearchBar onDark />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t('servicesTitle')}</h2>
        <ServiceChips />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('nearYou')}</h2>
          <Link
            href="/discovery"
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            {t('seeAll')}
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
        <DiscoveryView filters={{}} limit={6} />
      </section>
    </div>
  );
}
