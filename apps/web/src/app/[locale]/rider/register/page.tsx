import { getTranslations, setRequestLocale } from "next-intl/server";
import { RiderRegistrationView } from "@/components/rider/registration/rider-registration-view";

export const metadata = { title: "Register as Rider" };

export default async function RiderRegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("rider.register");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <RiderRegistrationView />
    </div>
  );
}
