import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Globe, LogOut } from 'lucide-react';
import { LOCALE_LABELS, routing } from '@/i18n/routing';
import { changeCustomerLanguage, signOutCustomer } from '@/lib/customer/actions';
import { fetchForCustomerPage } from '@/lib/customer/server';
import type { CustomerProfile } from '@/lib/customer/types';
import { ProfileForm } from './profile-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Profile' };

export default async function CustomerProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  const { data: profile } = await fetchForCustomerPage<CustomerProfile>('/me', {
    locale,
    returnTo: `/${locale}/profile`,
    cache: 'no-store',
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('customer.profile.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('customer.profile.name')}</CardTitle>
          <CardDescription>
            {t('customer.profile.phone')}:{' '}
            <span dir="ltr" className="font-mono">
              {profile.phone}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm locale={locale} name={profile.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="text-muted-foreground size-4" aria-hidden />
            <CardTitle className="text-base">{t('customer.profile.language')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {routing.locales.map((nextLocale) => (
              <form key={nextLocale} action={changeCustomerLanguage.bind(null, locale, nextLocale)}>
                <Button type="submit" variant={nextLocale === locale ? 'default' : 'outline'} size="sm">
                  <span lang={nextLocale}>{LOCALE_LABELS[nextLocale]}</span>
                </Button>
              </form>
            ))}
          </div>
        </CardContent>
      </Card>

      <form action={signOutCustomer.bind(null, locale)}>
        <Button type="submit" variant="outline" className="w-full">
          <LogOut />
          {t('customer.profile.signOut')}
        </Button>
      </form>
    </div>
  );
}
