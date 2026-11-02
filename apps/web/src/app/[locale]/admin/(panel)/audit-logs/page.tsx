import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { AuditLogTable } from './audit-log-table';

export const metadata: Metadata = { title: 'Audit log' };

export default async function AuditLogsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('audit');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AuditLogTable />
    </>
  );
}
