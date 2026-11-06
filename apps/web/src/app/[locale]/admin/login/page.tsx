import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Admin sign in' };

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
    error === 'not_admin' ? t('errors.notAdmin') : error === 'expired' ? t('errors.sessionExpired') : undefined;

  return (
    <AuthShell role="admin">
      <LoginForm locale={locale} next={next} banner={banner} />
      <p className="text-muted-foreground -mt-2 text-xs leading-relaxed">{t('auth.admin.notice')}</p>
    </AuthShell>
  );
}
