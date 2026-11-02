import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function AdminLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, error } = await searchParams;
  const t = await getTranslations();

  const banner =
    error === 'not_admin'
      ? t('errors.notAdmin')
      : error === 'expired'
        ? t('errors.sessionExpired')
        : undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-3 flex size-11 items-center justify-center rounded-xl text-lg font-semibold">
            D
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{t('login.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('login.subtitle')}</p>
        </div>

        <LoginForm locale={locale} next={next} banner={banner} />

        <p className="text-muted-foreground mt-6 text-center text-xs leading-relaxed">
          {t('login.customerHint')}
        </p>
      </div>
    </main>
  );
}
