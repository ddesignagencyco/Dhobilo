import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { RiderJobDetailView } from '@/components/rider/job/rider-job-detail-view';

export const metadata = { title: 'Job Details' };

export default async function RiderJobPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('rider.job');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button asChild variant="outline" className="hidden h-10 md:inline-flex">
            <Link href="/rider/home">
              <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
              {t('backToJobs')}
            </Link>
          </Button>
        }
      />
      <RiderJobDetailView jobId={id} />
    </div>
  );
}
