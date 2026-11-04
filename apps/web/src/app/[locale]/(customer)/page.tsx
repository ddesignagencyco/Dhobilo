import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, Shirt } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api/fetch';
import { currentCustomer } from '@/lib/customer/server';
import type { ActiveCity } from '@/lib/customer/types';
import { CityPicker } from '@/components/customer/city-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Home' };

export default async function CustomerHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const customer = await currentCustomer();

  let cities: ActiveCity[] = [];
  let citiesFailed = false;
  try {
    const { data } = await apiFetch<ActiveCity[]>('/cities', { cache: 'no-store' });
    cities = data;
  } catch {
    citiesFailed = true;
  }

  const name = customer?.name?.trim();
  const greeting = name ? t('customer.home.greeting', { name }) : t('customer.home.greetingGuest');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('customer.tagline')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('customer.home.city')}</CardTitle>
          <CardDescription>{t('customer.home.chooseCity')}</CardDescription>
        </CardHeader>
        <CardContent>
          {citiesFailed ? (
            <Alert variant="destructive">
              <AlertDescription>{t('customer.home.cityLoadError')}</AlertDescription>
            </Alert>
          ) : (
            <CityPicker cities={cities} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
            <Shirt className="size-5" aria-hidden />
          </div>
          <CardTitle className="text-base">{t('customer.home.nextTitle')}</CardTitle>
          <CardDescription>{t('customer.home.nextBody')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/orders">
              {t('customer.home.ordersCta')}
              <ArrowRight className="rtl:rotate-180" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
