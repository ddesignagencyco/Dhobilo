import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LogOut, Phone } from 'lucide-react';
import { LOCALE_LABELS, routing } from '@/i18n/routing';
import { changeCustomerLanguage, signOutCustomer } from '@/lib/customer/actions';
import { fetchForCustomerPage } from '@/lib/customer/server';
import type { CustomerProfile, NotificationPrefs } from '@/lib/customer/types';
import { ProfileForm } from './profile-form';
import { Button } from '@/components/ui/button';
import { AddressBook } from '@/components/customer/profile/address-book';
import { NotificationPreferences } from '@/components/customer/profile/notification-preferences';
import { Monogram } from '@/components/customer/ui/monogram';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Profile' };

export default async function CustomerProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('customer.profile');

  const [{ data: profile }, { data: prefs }] = await Promise.all([
    fetchForCustomerPage<CustomerProfile>('/me', { locale, returnTo: `/${locale}/profile`, cache: 'no-store' }),
    fetchForCustomerPage<NotificationPrefs>('/me/notification-preferences', {
      locale,
      returnTo: `/${locale}/profile`,
      cache: 'no-store',
    }),
  ]);

  const displayName = profile.name?.trim() || t('guestName');

  return (
    <div className="space-y-4">
      <section className="bg-card flex items-center gap-4 rounded-3xl border p-4 shadow-xs">
        <Monogram name={displayName} size="lg" className="rounded-full" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{displayName}</h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
            <Phone className="size-3.5" aria-hidden />
            <span dir="ltr" className="tabular">
              {profile.phone}
            </span>
          </p>
        </div>
      </section>

      <section className="bg-card space-y-3 rounded-2xl border p-4 shadow-xs">
        <h2 className="text-base font-semibold">{t('detailsTitle')}</h2>
        <ProfileForm locale={locale} name={profile.name} />
      </section>

      <AddressBook />

      <section className="bg-card space-y-3 rounded-2xl border p-4 shadow-xs">
        <h2 className="text-base font-semibold">{t('language')}</h2>
        <div className="bg-muted grid grid-cols-2 gap-1 rounded-full p-1">
          {routing.locales.map((nextLocale) => (
            <form key={nextLocale} action={changeCustomerLanguage.bind(null, locale, nextLocale)}>
              <button
                type="submit"
                aria-pressed={nextLocale === locale}
                className={cn(
                  'w-full rounded-full py-2 text-sm font-medium transition-all duration-300 active:scale-95',
                  nextLocale === locale ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                )}
              >
                <span lang={nextLocale}>{LOCALE_LABELS[nextLocale]}</span>
              </button>
            </form>
          ))}
        </div>
      </section>

      <NotificationPreferences initial={prefs} />

      <form action={signOutCustomer.bind(null, locale)}>
        <Button type="submit" variant="outline" className="text-destructive h-11 w-full rounded-full">
          <LogOut aria-hidden />
          {t('signOut')}
        </Button>
      </form>
    </div>
  );
}
