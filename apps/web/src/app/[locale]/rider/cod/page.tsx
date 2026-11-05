import { getTranslations, setRequestLocale } from "next-intl/server";
import { CodCollectionScreen } from "@/components/rider/cod/cod-collection-screen";

export const metadata = { title: "Cash on delivery" };

export default async function RiderCodPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("rider.cod");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <CodCollectionScreen />
    </div>
  );
}
