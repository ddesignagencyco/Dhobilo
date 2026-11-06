import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthShell } from '@/components/auth/auth-shell';
import { OtpSignIn } from '@/components/auth/otp-sign-in';

export const metadata: Metadata = { title: 'Sign in' };

export default async function CustomerLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, error } = await searchParams;
  const t = await getTranslations('auth');

  const banner =
    error === 'expired'
      ? t('form.expired')
      : error === 'not_customer'
        ? t('form.wrongRole', { area: t('area.customer') })
        : undefined;

  return (
    <AuthShell role="customer">
      <OtpSignIn
        role="customer"
        locale={locale}
        next={next}
        banner={banner}
        devHint={process.env.NODE_ENV !== 'production'}
      />
    </AuthShell>
  );
}
