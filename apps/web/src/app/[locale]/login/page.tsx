import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LoginFlow } from './login-flow';

export const metadata: Metadata = { title: 'Sign in' };

export default async function CustomerLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string; as?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, error, as } = await searchParams;
  const t = await getTranslations();

  const banner =
    error === 'expired'
      ? t('customer.login.expired')
      : error === 'not_customer'
        ? t('customer.login.notCustomer')
        : undefined;

  return (
    <main className="bg-muted/40 flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-3 flex size-11 items-center justify-center rounded-xl text-lg font-semibold">
            D
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{t('customer.brand')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('customer.tagline')}</p>
        </div>

        <LoginFlow
          locale={locale}
          next={next}
          asVendor={as === 'vendor'}
          banner={banner}
          devHint={process.env.NODE_ENV !== 'production' ? t('customer.login.devHint') : undefined}
        />
      </div>
    </main>
  );
}
