import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/admin/page-header";
import { VendorEarningsDashboard } from "@/components/vendor/earnings/vendor-earnings-dashboard";

export default async function VendorEarningsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vendor.earnings");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <VendorEarningsDashboard />
    </>
  );
}
