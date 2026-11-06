import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/admin/page-header";
import { VendorPayoutsView } from "@/components/vendor/payouts/vendor-payouts-view";

export default async function VendorPayoutsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vendor.payouts");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <VendorPayoutsView />
    </>
  );
}
