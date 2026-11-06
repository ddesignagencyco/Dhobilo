import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/admin/page-header";
import { VendorLedgerView } from "@/components/vendor/ledger/vendor-ledger-view";

export default async function VendorLedgerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vendor.ledger");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <VendorLedgerView />
    </>
  );
}
