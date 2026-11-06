import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { RiderJobDetailView } from "@/components/rider/job/rider-job-detail-view";

export const metadata = { title: "Job Details" };

export default async function RiderJobPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("rider.job");

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <RiderJobDetailView jobId={id} />
    </div>
  );
}
