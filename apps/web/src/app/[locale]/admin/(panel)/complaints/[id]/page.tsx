import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/admin/page-header';
import { StatusBadge } from '@/components/admin/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/errors';
import { fetchForPage } from '@/lib/api/server';
import type { AdminComplaint } from '@/lib/api/types';
import { humanise } from '@/lib/format';
import { ComplaintConsole } from './complaint-console';

export const metadata: Metadata = { title: 'Complaint' };

export default async function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  let complaint: AdminComplaint;
  try {
    const result = await fetchForPage<AdminComplaint>(`/admin/complaints/${id}`, {
      locale,
      returnTo: `/${locale}/admin/complaints/${id}`,
      cache: 'no-store',
    });
    complaint = result.data;
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  }

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ms-2">
        <Link href="/admin/complaints">
          <ArrowLeft className="rtl:rotate-180" />
          {t('complaints.backToList')}
        </Link>
      </Button>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {complaint.subject || t('complaints.noSubject')}
            <StatusBadge status={complaint.status} />
            <Badge variant={complaint.type === 'REDO' ? 'info' : 'outline'}>{humanise(complaint.type)}</Badge>
          </span>
        }
        description={`${complaint.order?.orderNo ?? ''} · ${complaint.vendor?.businessName ?? ''}`}
      />

      <ComplaintConsole initial={complaint} />
    </>
  );
}
