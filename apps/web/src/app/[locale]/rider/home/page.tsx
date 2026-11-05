import { getTranslations, setRequestLocale } from "next-intl/server";
import { RiderHomeView } from "@/components/rider/home/rider-home-view";

export const metadata = { title: "Available Jobs" };

export default async function RiderHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("rider.home");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <RiderHomeView />
    </div>
  );
}
